'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildForumActivity, completeWeekRange } = require('../lib/forum-activity');

test('builds a complete Monday-to-Sunday range', () => {
	assert.deepEqual(completeWeekRange(4, new Date('2026-09-03T12:00:00.000Z')), {
		weeks: 4,
		startDate: '2026-08-03',
		endDate: '2026-08-30',
		endExclusiveDate: '2026-08-31',
	});
});

test('counts customer requests and replies while excluding all staff and deleted content', () => {
	const range = {
		weeks: 1,
		startDate: '2026-08-24',
		endDate: '2026-08-30',
		endExclusiveDate: '2026-08-31',
	};
	const at = value => new Date(value).getTime();
	const topics = [
		{ tid: 10, mainPid: 100, deleted: 0 },
		{ tid: 11, mainPid: 110, deleted: 0 },
		{ tid: 12, mainPid: 120, deleted: 1 },
	];
	const posts = [
		{ pid: 100, tid: 10, uid: 42, timestamp: at('2026-08-24T08:00:00Z'), deleted: 0 },
		{ pid: 101, tid: 10, uid: 42, timestamp: at('2026-08-24T09:00:00Z'), deleted: 0 },
		{ pid: 102, tid: 10, uid: 43, timestamp: at('2026-08-24T10:00:00Z'), deleted: 0 },
		{ pid: 103, tid: 10, uid: 1, timestamp: at('2026-08-24T11:00:00Z'), deleted: 0 },
		{ pid: 104, tid: 10, uid: 2, timestamp: at('2026-08-24T12:00:00Z'), deleted: 0 },
		{ pid: 105, tid: 10, uid: 0, timestamp: at('2026-08-24T13:00:00Z'), deleted: 0 },
		{ pid: 106, tid: 10, uid: 44, timestamp: at('2026-08-24T14:00:00Z'), deleted: 1 },
		{ pid: 110, tid: 11, uid: 43, timestamp: at('2026-08-25T08:00:00Z'), deleted: 0 },
		{ pid: 120, tid: 12, uid: 45, timestamp: at('2026-08-26T08:00:00Z'), deleted: 0 },
	];

	assert.deepEqual(buildForumActivity({ posts, topics, staffUids: [1, 2], range }), [
		{
			date: '2026-08-24',
			newTopics: 1,
			replies: 2,
			customerPosts: 3,
			uniquePosters: 2,
			uniqueRequesters: 1,
		},
		{
			date: '2026-08-25',
			newTopics: 1,
			replies: 0,
			customerPosts: 1,
			uniquePosters: 1,
			uniqueRequesters: 1,
		},
	]);
});
