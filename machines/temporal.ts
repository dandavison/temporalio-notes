import { createMachine, assign } from 'xstate';

interface Context {
  retries: number;
}

const temporalMachine = createMachine<Context>({
  id: 'Temporal',
  initial: 'notStarted',
  context: {
    retries: 0,
  },
  states: {
    notStarted: {
      on: {
        startWorkflow: 'WorkflowExecutionStarted',
      },
    },
    WorkflowExecutionStarted: {
      on: {
        tick: 'WorkflowTaskScheduled',
      },
    },
    WorkflowTaskScheduled: {
      on: {
        poll: 'WorkflowTaskStarted',
      },
    },
    WorkflowTaskStarted: {
      on: {
        waitForTimer: 'WorkflowTaskCompleted',
        waitForCondition: 'WorkflowTaskCompleted',
        executeActivity: 'WorkflowTaskCompleted__executeActivity',
        completeWorkflow: 'WorkflowExecutionCompleted',
      },
    },
    WorkflowTaskCompleted: {
      on: {
        tick: 'Waiting',
      },
    },
    Waiting: {
      on: {
        signal: 'WorkflowTaskScheduled',
        timerFire: 'WorkflowTaskScheduled',
      },
    },
    WorkflowTaskCompleted__executeActivity: {
      on: {
        tick: 'ActivityTaskScheduled',
      },
    },
    ActivityTaskScheduled: {
      on: {
        poll: 'ActivityTaskStarted',
      },
    },
    ActivityTaskStarted: {
      on: {
        completeActivity: 'ActivityTaskCompleted',
      },
    },
    ActivityTaskCompleted: {
      on: {
        tick: 'Waiting',
      },
    },
    WorkflowExecutionCompleted: {
      type: 'final',
    },
  },
});
