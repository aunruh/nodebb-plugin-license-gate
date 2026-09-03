'use strict';

const BERLIN_TIME_ZONE = 'Europe/Berlin';

const berlinDateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: BERLIN_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

function berlinDateKey(date) {
	const parts = berlinDateFormatter.formatToParts(date);
	const value = type => parts.find(part => part.type === type)?.value || '';
	return `${value('year')}-${value('month')}-${value('day')}`;
}

function shiftDateKey(dateKey, days) {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function completeWeekRange(weeks, now = new Date()) {
	const today = berlinDateKey(now);
	const utcDay = new Date(`${today}T12:00:00.000Z`).getUTCDay();
	const daysSinceMonday = (utcDay + 6) % 7;
	const endExclusiveDate = shiftDateKey(today, -daysSinceMonday);
	return {
		weeks,
		startDate: shiftDateKey(endExclusiveDate, weeks * -7),
		endDate: shiftDateKey(endExclusiveDate, -1),
		endExclusiveDate,
	};
}

function buildForumActivity({ posts, topics, staffUids, range }) {
	const staff = new Set(staffUids.map(Number));
	const topicById = new Map(topics.filter(Boolean).map(topic => [String(topic.tid), topic]));
	const daily = new Map();

	for (const post of posts) {
		if (!post || post.deleted) continue;
		const uid = Number(post.uid);
		if (!Number.isInteger(uid) || uid < 1 || staff.has(uid)) continue;
		const topic = topicById.get(String(post.tid));
		if (!topic || topic.deleted) continue;
		const timestamp = Number(post.timestamp);
		if (!Number.isFinite(timestamp)) continue;
		const date = berlinDateKey(new Date(timestamp));
		if (date < range.startDate || date >= range.endExclusiveDate) continue;

		const day = daily.get(date) || {
			date,
			newTopics: 0,
			replies: 0,
			posterUids: new Set(),
			requesterUids: new Set(),
		};
		const isNewTopic = String(post.pid) === String(topic.mainPid);
		if (isNewTopic) {
			day.newTopics += 1;
			day.requesterUids.add(uid);
		} else {
			day.replies += 1;
		}
		day.posterUids.add(uid);
		daily.set(date, day);
	}

	return Array.from(daily.values())
		.sort((a, b) => a.date.localeCompare(b.date))
		.map(day => ({
			date: day.date,
			newTopics: day.newTopics,
			replies: day.replies,
			customerPosts: day.newTopics + day.replies,
			uniquePosters: day.posterUids.size,
			uniqueRequesters: day.requesterUids.size,
		}));
}

module.exports = {
	berlinDateKey,
	buildForumActivity,
	completeWeekRange,
};
