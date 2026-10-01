export interface DashboardMovementCase {
  application: {
    createdAt: Date;
    reviewCompletedAt?: Date | null;
  };
  highIssueCount: number;
}

export interface DashboardMovementDay {
  label: string;
  submitted: number;
  completed: number;
  flagged: number;
  max: number;
}

export function getDashboardDailyMovement({
  cases,
  today = new Date(),
}: {
  cases: DashboardMovementCase[];
  today?: Date;
}): DashboardMovementDay[] {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  return days.map((date) => {
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    const submitted = cases.filter(
      ({ application }) => application.createdAt >= date && application.createdAt < nextDate,
    ).length;
    const completed = cases.filter(
      ({ application }) =>
        application.reviewCompletedAt &&
        application.reviewCompletedAt >= date &&
        application.reviewCompletedAt < nextDate,
    ).length;
    const flagged = cases.filter(
      ({ application, highIssueCount }) =>
        highIssueCount > 0 && application.createdAt >= date && application.createdAt < nextDate,
    ).length;

    return {
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
      submitted,
      completed,
      flagged,
      max: Math.max(submitted, completed, flagged, 1),
    };
  });
}
