UPDATE `review_issue`
SET
  `status` = 'open',
  `resolvedAt` = NULL
WHERE `status` = 'accepted';
