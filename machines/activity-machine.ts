// https://xstate.js.org/viz/

import { Machine } from 'xstate';

const activityMachine = Machine({
  id: 'ActivityMachine',
  initial: 'Created',
  states: {
    Created: {
      on: {
        Schedule: 'ScheduleCommandCreated',
      },
    },
    ScheduleCommandCreated: {
      on: {
        CommandScheduleActivityTask: 'ScheduleCommandCreated',
        ActivityTaskScheduled: 'ScheduledEventRecorded',
        Cancel: 'Canceled',
      },
    },
    ScheduledEventRecorded: {
      on: {
        ActivityTaskStarted: 'Started',
        ActivityTaskTimedOut: 'TimedOut',
        Cancel: 'ScheduledActivityCancelCommandCreated',
        Abandon: 'Canceled',
      },
    },
    Started: {
      on: {
        ActivityTaskCompleted: 'Completed',
        ActivityTaskFailed: 'Failed',
        ActivityTaskTimedOut: 'TimedOut',
        Cancel: 'StartedActivityCancelCommandCreated',
        Abandon: 'Canceled',
      },
    },
    ScheduledActivityCancelCommandCreated: {
      on: {
        CommandRequestCancelActivityTask:
          'ScheduledActivityCancelCommandCreated',
        ActivityTaskCancelRequested: 'ScheduledActivityCancelEventRecorded',
      },
    },
    ScheduledActivityCancelEventRecorded: {
      on: {
        ActivityTaskCanceled: 'Canceled',
        ActivityTaskStarted: 'StartedActivityCancelEventRecorded',
        ActivityTaskTimedOut: 'TimedOut',
      },
    },
    StartedActivityCancelCommandCreated: {
      on: {
        CommandRequestCancelActivityTask: 'StartedActivityCancelCommandCreated',
        ActivityTaskCancelRequested: 'StartedActivityCancelEventRecorded',
      },
    },
    StartedActivityCancelEventRecorded: {
      on: {
        ActivityTaskFailed: 'Failed',
        ActivityTaskCompleted: 'Completed',
        ActivityTaskTimedOut: 'TimedOut',
        ActivityTaskCanceled: 'Canceled',
      },
    },
    Canceled: {
      on: {
        ActivityTaskStarted: 'Canceled',
        ActivityTaskCompleted: 'Canceled',
      },
    },
    Completed: {},
    Failed: {},
    TimedOut: {},
  },
});
