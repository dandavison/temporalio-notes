# SDK workers

A workflow is a function `w(code, events) -> commands`

Each invocation is referred to as a workflow task (WFT).

> Nondeterminism errors always take the form of
- "this isn't the event I expected given the last machine I made was X" or
- "why is there no event for machine X I just made" or
- "machine X is in state Y but event can't work there
@Spencer Judge
>

# Exceptions and handlers

|  | **Update** | **Signal** |
| --- | --- | --- |
| **Java** | [`runner.executeInWorkflowThread`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L158) | [`runner.executeInWorkflowThread`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L146) |
| **Python** | [`run_update()`](https://github.com/temporalio/sdk-python/blob/consistent-error-capitalization/temporalio/worker/_workflow_instance.py#L594) | [`self._run_top_level_workflow_function`](https://github.com/temporalio/sdk-python/blob/consistent-error-capitalization/temporalio/worker/_workflow_instance.py#L1705) |
| **Typescript** | [`doUpdateImpl`](https://github.com/temporalio/sdk-typescript/blob/main/packages/workflow/src/internals.ts#L638) | [`execute`](https://github.com/temporalio/sdk-typescript/blob/main/packages/workflow/src/internals.ts#L740) |

## Flags

```rust
/// At the start of every workflow task an SDK worker has a set F of in-use
/// flags.
///
///  The basic algorithm is:
///  - When starting replay, the worker sets F equal to the flags recorded in
///    the first WFT in history (if there are no previous WFTs then F is empty).
///  -
///
///  When constructing a non-replay WFTComplete response,
///

```

On every non-replay WFT complete, we write all known flags to history (`write_all_known()`)

So we start replaying with empty flags, and as we replay may encounter a WFTCompleted with flags. These may be:

- flags added when adding all known on a non-replay WFT complete
-

## Worker implementation

Let’s follow the Java implementation.

WorkerFactory [starts](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/worker/WorkerFactory.java#L199) many [SyncWorkflowWorkers](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/worker/Worker.java#L135), each of which is a wrapper for [WorkflowWorker](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/WorkflowWorker.java#L109): [`start()`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/WorkflowWorker.java#L109)

This starts a Poller: [`start()`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/Poller.java#L90) passing it a [`WorkflowPollTask`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/WorkflowPollTask.java#L57) and a [`PollTaskExecutor`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/PollTaskExecutor.java#L52).

For each thread, this does the following:

 [`pollExecutor.execute(new PollLoopTask(new PollExecutionTask()))`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/Poller.java#L116)

[`PollExecutionTask.run()`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/Poller.java#L297) calls  `WorkflowPollTask.poll()` which does the long-poll: [`PollWorkflowTaskQueueResponse response = doPoll(request, scope)`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/WorkflowPollTask.java#L137). The result is a  [`WorkflowTask`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/WorkflowTask.java#L27) which is passed to the [`taskExecutor.process(task)`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/Poller.java#L300) method of [PollTaskExecutor](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/PollTaskExecutor.java#L52).

In [PollTaskExecutor](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/PollTaskExecutor.java#L52) we reach [`handler.handleWorkflowTask(task)`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/WorkflowWorker.java#L453) of [`WorkflowTaskHandler`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/worker/WorkflowTaskHandler.java#L35) and then to [`private Result handleWorkflowTaskWithQuery`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowTaskHandler.java#L103) and we end up at

[`WorkflowTaskResult wftResult = workflowRunTaskHandler.handleWorkflowTask(workflowTask, historyIterator);`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowTaskHandler.java#L134)

and then at a call to

[`private void applyServerHistory(long lastEventId, WorkflowHistoryIterator historyIterator)`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowRunTaskHandler.java#L234). Ignoring error handling, what this does is

```java
    while (historyIterator.hasNext()) {
      workflowStateMachines.handleEvent(historyIterator.next(), historyIterator.hasNext());
    }
```

after which, we form the WFT response by obtaining commands etc from the state machines (e.g. `workflowStateMachines.takeCommands()`).

So, we apply each history event in turn to a collection of state machines.

The first thing to notice is that a `WorkflowExecutionStarted` event will have no associated state machine instance, and will instead create a [`WorkflowExecutionHandler`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowExecutionHandler.java#L43) and run its [`runWorkflowMethod`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowExecutionHandler.java#L66) under [`DeterministicRunner.newRunner`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L129).

- call stack

    [`WorkflowStateMachines.handleSingleEvent`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L453)

    ⇒ [`WorkflowStateMachines.handleNonStatefulEvent(WorkflowExecutionStarted)`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L720)

    ⇒ [`StateMachinesCallbackImpl.start`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowRunTaskHandler.java#L400)

    ⇒ [`ReplayWorkflowExecutor.start`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowExecutor.java#L181)

    ⇒ [`SyncWorkflow.start`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L105)


## Workflow state machines

In order to understand the state machines, we first need to understand the way in which events are classified into different types:

- “Command events” after `WFTCompleted` (e.g. `ActivityTaskScheduled`, `TimerStarted`, `ChildWorkflowInitiated`, `UpdateAccepted/Completed`)
- Unprocessed history events before WFTStarted (e.g. signal, update, ActivityCompleted?, TimerFired?)
- `WFTScheduled`, `WFTStarted`, `WFTCompleted`

In [`handleEventsBatch`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L304) we have

```java
    for (Iterator<HistoryEvent> iterator = events.iterator(); iterator.hasNext(); ) {
        handleSingleEvent(event, isLastTask, hasNextEvent);
    }
```

and in [`handleSingleEvent`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L453) we see

```java
    if (isCommandEvent(event)) {
      handleCommandEvent(event);
      return;
    }
    final OptionalLong initialCommandEventId = getInitialCommandEventId(event);
    EntityStateMachine c = stateMachines.get(initialCommandEventId.getAsLong());
```

Here’s what’s happening:

- The workflow has a queue of `CancellableCommand`. Each has an associated state machine instance.
- So, for example, when the user code calls `executeActivity`, it [results](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflowContext.java#L261) in a call to [`WorkflowStateMachines.scheduleActivityTask`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L778),  which creates an instance of the state machine containing a callback, and pushes a command to the `commands` queue. The callback is invoked with the activity outcome, when the state machine transitions into a terminal state.
- On the other hand, consider the event handling that we were following above:
    - When we encounter a command event such as `ActivityTaskScheduled`, we call [`handleCommandEvent`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L491) which verifies that the next command in the queue matches the event, and removes it from the queue.
    - When we encounter a non-command event, we look up the corresponding initiating command (the initiating event ID is in the event data), with its state machine instance, and apply the event to the state machine.

- List of state machines

    ```java
    ActivityStateMachine
    CancelExternalStateMachine
    CancelWorkflowStateMachine
    ChildWorkflowStateMachine
    CompleteWorkflowStateMachine
    ContinueAsNewWorkflowStateMachine
    FailWorkflowStateMachine
    LocalActivityStateMachine
    MutableSideEffectStateMachine
    SideEffectStateMachine
    SignalExternalStateMachine
    TimerStateMachine
    UpdateProtocolStateMachine
    UpsertSearchAttributesStateMachine
    VersionStateMachine
    WorkflowTaskStateMachine

    interface EntityStateMachine {
      void handleCommand(CommandType commandType);
      void handleMessage(Message message);
      WorkflowStateMachines.HandleEventStatus handleEvent(HistoryEvent event, boolean hasNextEvent);
      void handleWorkflowTaskStarted();
      boolean isFinalState();
    }

    ```


## Execution of user code

Notice how [`CompletablePromise`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/CompletablePromiseImpl.java#L35) is used in many places, e.g. as a promise holding the result of an [`Activity`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflowContext.java#L352), [`ChildWorkflow`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflowContext.java#L623), [`Timer`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflowContext.java#L825). The blocking `.get()` call on the promise is implemented as

```java
WorkflowThread.await("<reason>", () -> {return completed})
```

which is [implemented](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowThreadContext.java#L76) as

```java
WorkflowThreadContext.yield(reason, unblockFunction)
```

Basically what this does is allow the [`WorkflowThreadScheduler`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowThreadScheduler.java#L28) to schedule other threads until `unblockFunction` returns `true`, i.e. until the promise is completed.

A core method seems to be

[`eventLoop`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L707)

⇒ [`eventLoop`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowRunTaskHandler.java#L405)

⇒ [`ReplayWorkflowExecutor.eventLoop`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowExecutor.java#L65)

⇒ [`SyncWorkflow.eventLoop`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L191)

⇒ [`DeterministicRunnerImpl.runUntilAllBlocked`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/DeterministicRunnerImpl.java#L185)

⇒ [`WorkflowThreadContext.runUntilBlocked`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowThreadContext.java#L242)

This is called, for example in the completion callback of [activity](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L778) and [timer](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L811), and when [transitioning](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowTaskStateMachine.java#L133) from `WorkflowTaskStarted` ⇒ `WorkflowTaskCompleted`.

For that, we need to look at

[`class SyncWorkflow implements ReplayWorkflow`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L54)

[`start`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L105) creates a [`WorkflowExecutionHandler`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowExecutionHandler.java#L43) and runs its [`runWorkflowMethod`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowExecutionHandler.java#L66) under [`DeterministicRunner.newRunner`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L129).

[`class DeterministicRunnerImpl implements DeterministicRunner`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/DeterministicRunnerImpl.java#L52) manages the three types of threads (in order of priority: workflow threads, “callback” threads, main workflow thread )

contains e.g.

[`runUntilAllBlocked`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/DeterministicRunnerImpl.java#L185)

E.g., an update is [handled](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L152) by invoking [`handleExecuteUpdate`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowExecutionHandler.java#L119) under [`runner.executeInWorkflowThread`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/SyncWorkflow.java#L158).

[`class WorkflowThreadImpl implements WorkflowThread`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowThreadImpl.java#L49)

[`public boolean runUntilBlocked(long deadlockDetectionTimeoutMs)`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowThreadImpl.java#L298)

[`public void start()`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/sync/WorkflowThreadImpl.java#L231)

## Workflow coroutines

We will focus initially on workflow execution. Pick an arbitrary point in the lifetime of a workflow. At this time there will be one, or more than one, task executing concurrently: there is always the main workflow body, but there may be others executing at this time: in particular, when a workflow receives an update or signal, it executes the handler in a new concurrent task, and task may spawn child tasks. (Queries are executed in the main workflow thread, in Java at least)

The way in which these async tasks are implemented differs between SDK languages, but the following things are true across all languages:

- Execution is logically single-threaded fashion: i.e. there is concurrency, but no parallelism
- Each executing task has an associated stack and instruction pointer
- Concurrency is cooperative: they yield to each other explicitly

We need a word to refer to these tasks. Logically at least, they are more like coroutines than threads (since they are cooperative), so we will call them “coroutines”.

# `sdk-python`

https://temporal.io/blog/durable-distributed-asyncio-event-loop

https://docs.python.org/3/library/asyncio-api-index.html

https://docs.python.org/3/library/asyncio-llapi-index.html

https://stackoverflow.com/questions/49005651/how-does-asyncio-actually-work

## Processing an activation

An activation contains jobs; it is how `sdk-core` delivers a Workflow Task to Python / TS / .NET / Ruby.

The workflow worker [calls](https://github.com/temporalio/sdk-python/blob/main/temporalio/worker/_workflow.py#L256)  [`workflow.activate`](https://github.com/temporalio/sdk-python/blob/main/temporalio/worker/_workflow_instance.py#L340). Here is a simplified version:

```python
def activate(self, act: proto.WorkflowActivation) -> proto.WorkflowActivationCompletion:

		job_sets = [signal_and_update_jobs, [main_workflow_job], query_jobs]

    try:
        for job_set in job_sets:
            for job in job_set:
		            # We implement loop.call_soon; all asyncio.Task does is append to self._ready
		            asyncio.Task(coro_that_runs_workflow_method_with_exception_handling)

						# self._ready contains task handles added by asyncio (via our impl of loop.call_soon)
						# and timer handles added by the SDK when the activation contains a fire_timer job.
            while self._ready:
                while self._ready:
                    handle = self._ready.popleft()
                    handle._run() # in asyncio; by default logs exceptions (default_exception_handler)
                    if self._current_activation_error:
                        raise self._current_activation_error

                # Unblock and remove conditions that are now true
                # (note that evaluating them may add to the ready list).
                if not_query_job:
		                for cond, future in self._conditions:
				                if not future.done():
						                if cond():
								                future.set_done()
								            else:
										            remaining_conditions.append((cond, future))
										self._conditions = remaining_conditions
    except Exception as err:
        if is_workflow_failure_exception(err):
		        workflow_activation_completion.add_command(FAIL_WORKFLOW_EXECUTION)
        else:
		        logger.warning("Failed activation...")
		        workflow_activation_completion.fail_workflow_task_command()

    return workflow_activation_completion
```

There is one more thing to explain: `asyncio.Task(coro_that_runs_workflow_method_with_exception_handling)`.

How exactly are exceptions handled in signals, updates, and the main workflow method?

For the main workflow method, and signals, the simplified logic is

```python
        try:
            await coro
        except _ContinueAsNewError:
            workflow_activation_completion.add_command(CONTINUE_AS_NEW)
        except (Exception, asyncio.CancelledError) as err:
            if self._cancel_requested and is_cancelled_exception(err):
                workflow_activation_completion.add_command(CANCEL_WORKFLOW_EXECUTION)
            elif is_workflow_failure_exception(err):
                workflow_activation_completion.add_command(FAIL_WORKFLOW_EXECUTION)
            else:
                self._current_activation_error = err
```

It’s different for updates: an error fails the update instead of the workflow execution.

Question: when we fail the workflow execution, do we carry on executing? I guess it doesn’t matter as no commands (not even LAs) will be honored.

Here’s `asyncio.sleep()`:

[https://github.com/python/cpython/blob/48cd104b0cf05dad8958efa9cb9666c029ef9201/Lib/asyncio/tasks.py#L703-L720](https://github.com/python/cpython/blob/48cd104b0cf05dad8958efa9cb9666c029ef9201/Lib/asyncio/tasks.py#L703-L720)

The implementation is:

1. Create a `Future`
2. Use [`loop.call_later(...)`](https://docs.python.org/3/library/asyncio-eventloop.html#asyncio.loop.call_later) to schedule a callback that will resolve the future
3. `await` the future. I.e., yield to the scheduler such that the coroutine is not resumed until the future transitions to a terminal state.

[`call_later`](https://github.com/python/cpython/blob/main/Lib/asyncio/base_events.py#L744) works by adding the callback to a heap data structure `self._scheduled`, which is sorted by time.

How does Temporal’s sleep need to differ?

- We issue a `Command` (activity completion) causing Rust to create an instance of `TimerStateMachine`
- Otherwise, it’s [very similar](https://github.com/temporalio/sdk-python/blob/main/temporalio/worker/_workflow_instance.py#L1957); we create an `asyncio.TimerHandle` and add it to a dict `self._pending_timers`
- Later, when the server sends a timer fired event, we [transfer](https://github.com/temporalio/sdk-python/blob/main/temporalio/worker/_workflow_instance.py#L609) the callback handle from `_pending_timers` to `self._ready`.

Which brings us to `self._run_once()`. All the asyncio event loop does is [call](https://github.com/python/cpython/blob/e53d105872fafa77507ea33b7ecf0faddd4c3b60/Lib/asyncio/base_events.py#L677)  `self._run_once()` in a loop. So what does it do?

Basically, `run_once()` executes “callbacks”. And, basically, there are two sorts of callbacks

- Callbacks representing a “step” between one `await` point and the next:
- Other callbacks scheduled by the user, or asyncio

Here, in `Task.__init__`, we see asyncio scheduling the `__step` method as a callback:

[https://github.com/python/cpython/blob/c3677befbecbd7fa94cde8c1fecaa4cc18e6aa2b/Lib/asyncio/tasks.py#L127](https://github.com/python/cpython/blob/c3677befbecbd7fa94cde8c1fecaa4cc18e6aa2b/Lib/asyncio/tasks.py#L127)

`call_soon` calls `_call_soon` which creates a `Handle` and appends it to `self._ready`.

And here we see that the `__step` method ultimately advances a generator-like object (the coroutine):

[https://github.com/python/cpython/blob/c3677befbecbd7fa94cde8c1fecaa4cc18e6aa2b/Lib/asyncio/tasks.py#L304](https://github.com/python/cpython/blob/c3677befbecbd7fa94cde8c1fecaa4cc18e6aa2b/Lib/asyncio/tasks.py#L304)

TODO: so if `__step` ends with an `await` on, say some network socket thing unrelated to Temporal, a future is created somewhere?

Finally let’s look at `sdk-python`'s `_run_once()`:

The algorithm is:

```
while any_callbacks_ready:

    run_all_ready_callbacks()
    for cond in conditions:
        if cond():
            add callbacks associated with cond's future to ready list
```

We want to ensure that coroutines have progressed as much as possible before recording a workflow completion.

So what callbacks are associated with a condition? I believe it’s a callback unblocking a promise associated with the `await workflow.condition()` call….

The thing is, `asyncio.wait_for` schedules a callback that will release the waiter in two ways:

1. It uses `call_later` to schedule it with delay
2. And it also adds it as a callback to the future being waited.

[https://github.com/temporalio/sdk-python/blob/7ac44450b13b49b7be991ec3e122b96c73163ed1/temporalio/worker/_workflow_instance.py#L1734-L1765](https://github.com/temporalio/sdk-python/blob/7ac44450b13b49b7be991ec3e122b96c73163ed1/temporalio/worker/_workflow_instance.py#L1734-L1765)

### Bug notes

OK, so what do we need to do to fix the two bugs?

For the `wait_condition` bug, we want to pop *one* handle off `_ready` and run it.

To make all coroutines settle, well…

Let’s go back to `activate()`.

The worker has received an activation for some workflow.

We go through each job in the activation, calling `apply()` on it. This does things like start  `asyncio.Task` for incoming signals and updates, and for the main WF coroutine if this is the first WFT. Recall: `asyncio.Task.__init__()` schedules `__step` for the first slice of the coroutine. (So if it’s  not the first WFT, then the recurring sequence of `__step` callbacks has already been kicked off.)

Now, after each category of jobs (e.g. handlers, start main wf coroutine), we call `_run_once()`. Until now, we’ve just scheduled coroutine step callbacks, but not executed them. And recall that `run_once` keeps running ready callbacks and checking conditions, until nothing is ready, even after unblocking wait condition promises.

And when we’ve done that for all job categories, it’s the end of the WFT.

So, why does this leave coroutines “unsettled”? Cos main WF coro is run

And what about the wait conditions? How can we make “its” coro slice execute next? Well, we have to know which handle is associated with a given condition.

So we need to map the wait-condition promise-resolving future to the callback handle in `self._ready`.

> `call_soon` calls `_call_soon` which creates a `Handle` and appends it to `self._ready`.
>

That future was created by `wait_condition`. And when it did so it added  a handle to the `self._scheduled` queue. And underneath, this handle was created by `call_later`.

Does our event loop run everything to completion?

If so, we should see the update coroutine print before returning. And we do.

# `sdk-typescript`

## Javascript event loop

- There is a queue of pending function calls: `[(fn, args), ...]`
- During the event loop, a call is popped off and executed, starts adding stack frames, and nothing else happens until the stack is empty.
- E.g. `setTimeout` adds a call to the queue after the specified timeout.
-

https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop

https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide/In_depth

User code must create a promise, issue a command as part of the activation completion, and the SDK arranges that a Rust state machine completes that promise later.

# Etc

## Java

[`public WorkflowTaskResult handleWorkflowTask`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowRunTaskHandler.java#L138) which uses a [`ReplayWorkflowRunTaskHandler`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowTaskHandler.java#L391)

```java
      handleWorkflowTaskImpl(workflowTask, historyIterator);
      List<Command> commands = workflowStateMachines.takeCommands();
      List<Message> messages = workflowStateMachines.takeMessages();
```

[`handleWorkflowTaskImpl`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/replay/ReplayWorkflowRunTaskHandler.java#L224)

```java
  private void handleWorkflowTaskImpl(
      PollWorkflowTaskQueueResponseOrBuilder workflowTask,
      WorkflowHistoryIterator historyIterator) {
    workflowStateMachines.setWorkflowStartedEventId(workflowTask.getStartedEventId());
    workflowStateMachines.setReplaying(workflowTask.getPreviousStartedEventId() > 0); // ?
    workflowStateMachines.setMessages(workflowTask.getMessagesList());
    applyServerHistory(workflowTask.getStartedEventId(), historyIterator);
  }

```

The logic marked `?` appears to be:

> If no WFT has ever started for this WFT then we are not replaying; otherwise we are replaying.
>

If so, then that suggests that

- a sticky worker is always considered to be “replaying”, except when the execution has never been started. I had previously thought that a sticky worker is never “replaying”, by definition.

```java
      while (historyIterator.hasNext()) {
        HistoryEvent event = historyIterator.next();
        currentEventId = event.getEventId();
        boolean hasNext = historyIterator.hasNext();
        workflowStateMachines.handleEvent(event, hasNext);
      }

```

I think here we’re getting the statemachine for each type of thing that’s going on: activity/timer/signal/WFT

[`EntityStateMachine c = stateMachines.get(initialCommandEventId)`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/WorkflowStateMachines.java#L434)

[`handleHistoryEvent`](https://github.com/temporalio/sdk-java/blob/master/temporal-sdk/src/main/java/io/temporal/internal/statemachines/StateMachine.java#L102)

```java
  public void handleHistoryEvent(EventType eventType, Data data) {
    executeTransition(new TransitionEvent<>(eventType), data);
  }

```

## Typescript

[TS]

An activity call ends up calling [`scheduleActivityNextHandler`](https://github.com/temporalio/sdk-typescript/blob/main/packages/workflow/src/workflow.ts#L141). There’s an integer named `seq` which I guess is incremented such that it uniquely labels each yield point. We create and return a promise, and essentially do `activator.completions.activity[seq] = {resolve, reject}.`

## Go

obtain polled task: [`case bw.taskQueueCh <- &polledTask{task}:`](https://github.com/temporalio/sdk-go/blob/master/internal/internal_worker_base.go#L443)

use polled task [`case task := <-bw.taskQueueCh`](https://github.com/temporalio/sdk-go/blob/master/internal/internal_worker_base.go#L386)

[`func (bw *baseWorker) processTask(task interface{})`](https://github.com/temporalio/sdk-go/blob/master/internal/internal_worker_base.go#L489)

[`func (wtp *workflowTaskPoller) processWorkflowTask(task *workflowTask)`](https://github.com/temporalio/sdk-go/blob/master/internal/internal_task_pollers.go#L329)

[`processWorkflowLoop`](https://github.com/temporalio/sdk-go/blob/master/internal/internal_task_handlers.go#L876)

[`func (wth *workflowTaskHandlerImpl) ProcessWorkflowTask`](https://github.com/temporalio/sdk-go/blob/master/internal/internal_task_handlers.go#L831)

[`func (w *workflowExecutionContextImpl) ProcessWorkflowTask`](https://github.com/temporalio/sdk-go/blob/master/internal/internal_task_handlers.go#L957)

[`prepareTask`](https://github.com/temporalio/sdk-go/blob/master/internal/internal_task_handlers.go#L406)

## Workflow completion

**Chad Retz**

[9 minutes ago](https://temporaltechnologies.slack.com/archives/C01FG4BRQVB/p1716474533547809?thread_ts=1716408791.081919&cid=C01FG4BRQVB)

Right, that is not correct. Return/throw from a workflow function just sets workflow complete. In Go and Java, it waits until all events are run and all coroutines are settled and then sets that workflow complete as a command. In core-based SDKs, it sets the command immediately, and then when all events are run and all coroutines are settled, it truncates any post-workflow-complete commands that happened

[](https://ca.slack-edge.com/TT31S6VK5-U05GA2YGJKU-0547ca176627-48)

**Dan Davison**

[8 minutes ago](https://temporaltechnologies.slack.com/archives/C01FG4BRQVB/p1716474547015879?thread_ts=1716408791.081919&cid=C01FG4BRQVB)

Hm, looking at the Python code you linked it looks like we actually let everything happen and then post-hoc remove non-query commands. (edited)

[](https://ca.slack-edge.com/TT31S6VK5-U02FVVAR5GQ-f74f76237dae-48)

**Chad Retz**

[8 minutes ago](https://temporaltechnologies.slack.com/archives/C01FG4BRQVB/p1716474599907559?thread_ts=1716408791.081919&cid=C01FG4BRQVB)

Exactly, that's how core-based SDKs wrote their logic (there's nothing "core" about it, it's just that we all copied each other). So it means that returning from the workflow effectively stops everything right there from a user POV whereas in Go/Java, returning from a workflow still lets things run.

## History fetches

Suppose a workflow has a high rate of incoming signals or activity completions.

Then a WFT may be dispatched with a non-null `NextPageToken` (this is because HistoryService reads one “page” of events only when constructing the events to send to MatchingService to be incorporated in the WFT).

Suppose we are a workflow worker polling a sticky queue and we receive such a WFT.

We are going to deliver the WFT (or an activation, if we are `sdk-core`) to lang.

Before we do this, we issue a sequence of requests to `GetWorkflowExecutionHistory` until we get a response indicating that there are no more events (`next_page_token` is null).

We never deliver a WFT/activation to lang until we have done this.

# Java state machines Python sketch

```python
from collections import deque
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Iterator, Optional

from manim import VGroup, VMobject

import esv
from examples.temporal.commands import Command, CommandType
from examples.temporal.constants import CONTAINER_HEIGHT, CONTAINER_WIDTH
from examples.temporal.history import HistoryEvent, HistoryEventId, HistoryEventType
from examples.temporal.smbp import Smbp
from examples.temporal.utils import ContainerRectangle, labeled_rectangle

if TYPE_CHECKING:
    from examples.temporal.scheduler import Scheduler
    from examples.temporal.worker_scene import WorkerScene

MACHINE_RADIUS = 0.3

@dataclass
class StateMachine(esv.Entity):
    workflow_machines: "WorkflowStateMachines"

    def render(self) -> VMobject:
        label = self.__class__.__name__.replace("StateMachine", "\nStateMachine")
        return labeled_rectangle(label)

    def handle_history_event(self, event: HistoryEvent): ...

class WorkflowTaskStateMachine(StateMachine):
    def __init__(
        self,
        workflow_machines: "WorkflowStateMachines",
        commands_that_will_be_generated_in_this_wft: list["Command"],
    ):
        super().__init__(workflow_machines=workflow_machines)
        self.commands_that_will_be_generated_in_this_wft = (
            commands_that_will_be_generated_in_this_wft
        )

    def handle_history_event(self, event: HistoryEvent):
        assert event.event_type in [
            HistoryEventType.WFT_SCHEDULED,
            HistoryEventType.WFT_STARTED,
            HistoryEventType.WFT_COMPLETED,
        ]
        match event.event_type:
            case HistoryEventType.WFT_STARTED:
                print(
                    f"🟠 WorkflowTaskStateMachine handling {event}: run_all_coroutines_until_blocked"
                )
                self.workflow_machines.scheduler.run_all_coroutines_until_blocked(
                    self.commands_that_will_be_generated_in_this_wft,
                    self.workflow_machines,
                )

class ActivityTaskStateMachine(StateMachine):
    def handle_history_event(self, event: HistoryEvent):
        assert event.event_type in [
            HistoryEventType.ACTIVITY_TASK_SCHEDULED,
            HistoryEventType.ACTIVITY_TASK_STARTED,
            HistoryEventType.ACTIVITY_TASK_COMPLETED,
        ]

class TimerStateMachine(StateMachine):
    def handle_history_event(self, event: HistoryEvent):
        assert event.event_type in [
            HistoryEventType.TIMER_STARTED,
            HistoryEventType.TIMER_FIRED,
        ]

@dataclass
class WorkflowStateMachines(esv.Entity):
    scheduler: "Scheduler"
    # User workflow code is represented by a stream of batches of commands generated in each WFT.
    user_workflow_code: Iterator[list["Command"]]
    commands_generated_by_user_workflow_code: deque["Command"] = field(
        default_factory=deque
    )
    state_machines: dict[HistoryEventId, StateMachine] = field(default_factory=dict)

    __children__ = ["state_machines"]

    def handle(self, event: esv.Event) -> None:
        match event.payload:
            case HistoryEvent():
                self.handle_history_event(event.payload)
            case Command() as command:
                self.handle_command(event.payload)
                self.commands_generated_by_user_workflow_code.append(command)

    def handle_command(self, command: Command) -> None:
        match command.command_type:
            case CommandType.START_TIMER:
                machine = self.add_machine(TimerStateMachine(self))
                scene: WorkerScene = self.scene  # type: ignore
                coro = scene.coroutines.coroutines[command.coroutine_id]
                scene.smbps.smbps.append(Smbp(coro, machine))

    def handle_history_event(self, event: HistoryEvent) -> None:
        # TODO: self.is_replaying

        if event.event_type == HistoryEventType.WF_STARTED:
            # Non-stateful event
            # Create a DeterministicRunner ready to run the main workflow method
            # Java: see SyncWorkflow.start()
            ...

        elif event.event_type == HistoryEventType.WFT_SCHEDULED:
            # Non-stateful event
            # Create an instance of WorkflowTaskStateMachine.
            machine = self.add_machine(
                WorkflowTaskStateMachine(self, next(self.user_workflow_code)),
                event,
            )

        elif event.event_type == HistoryEventType.WFT_STARTED:
            # Look up WorkflowTaskStateMachine instance and handle the event.
            # The state machine transition calls runAllUntilBlocked() if this is the last
            # WFT_STARTED event in history (i.e. no WFT_COMPLETED for it yet).
            machine = self.state_machines[event.initiating_event_id]
            machine.handle_history_event(event)

        elif event.event_type == HistoryEventType.WFT_COMPLETED:
            # Look up WorkflowTaskStateMachine instance and handle the event.
            # The state machine transition calls runAllUntilBlocked().
            self.state_machines[event.initiating_event_id].handle_history_event(event)

        elif event.event_type == HistoryEventType.TIMER_STARTED:
            # Command event: see below
            #
            # We see this event because user code called `sleep(duration)`, which is implemented as
            # `newTimer(duration).get()`. `newTimer` returns a workflow.Promise backed by a new
            # TimerStateMachine instance (i.e. a promise-completing callback is passed into the
            # state machine). The state machine emits the START_TIMER command on creation and, when
            # later transitioning to complete, will complete the promise.

            # TODO: should be created by command and set promise-completing callback
            machine = self.add_machine(TimerStateMachine(workflow_machines=self), event)

        elif event.event_type == HistoryEventType.TIMER_FIRED:
            # Look up TimerStateMachine instance and handle the event by calling the promise completion
            # callback that was provided when the state machine was created.
            # see TimerStateMachine.java
            self.state_machines[event.initiating_event_id].handle_history_event(event)

        elif event.event_type == HistoryEventType.ACTIVITY_TASK_SCHEDULED:
            # Command event: see below
            #
            # Same pattern as TIMER_STARTED: we see this event because the user's code called
            # WorkflowInternal.executeActivity, which emits the SCHEDULE_ACTIVITY_TASK command that
            # creates this event, and creates a workflow.Promise backed by an ActivityStateMachine,
            # such that the promise is completed when the activity is completed.

            # TODO: should be created by command and set promise-completing callback
            self.add_machine(
                ActivityTaskStateMachine(workflow_machines=self),
                event,
            )

        elif event.event_type == HistoryEventType.ACTIVITY_TASK_STARTED:
            self.state_machines[event.initiating_event_id].handle_history_event(event)

        elif event.event_type == HistoryEventType.ACTIVITY_TASK_COMPLETED:
            self.state_machines[event.initiating_event_id].handle_history_event(event)

        # Command events
        # --------------
        if event.event_type.is_command_event():
            # Events corresponding to a command issued by user workflow code
            # E.g. ACTIVITY_TASK_SCHEDULED, TIMER_STARTED, WORKFLOW_EXECUTION_COMPLETED

            # At some point, we executed some user code in one of the workflow coroutines and it
            # generated the command corresponding to this event. (If we are replaying from the
            # beginning then that just happened in this WFT; but if we are a sticky worker with this
            # workflow execution in cache, then that happened in a previous WFT.) When that
            # happened, we created an instance of the state machine corresponding to the event, and
            # enqueued a Command object containing the state machine instance.

            # Now, we have encountered the corresponding event in history. It should be at the front
            # of the queue.
            command = self.commands_generated_by_user_workflow_code.popleft()
            assert event.event_type.matches_command_type(command.command_type)
            assert command.machine
            command.machine.handle_history_event(event)

    def add_machine(
        self, machine: StateMachine, initiating_event: Optional[HistoryEvent] = None
    ) -> StateMachine:
        self.state_machines[initiating_event.id if initiating_event else 0] = machine
        return machine

    def render(self) -> VMobject:
        container = ContainerRectangle(width=CONTAINER_WIDTH, height=CONTAINER_HEIGHT)
        state_machines = VGroup(
            *(c.mobj for _, c in sorted(self.state_machines.items()))
        ).move_to(container)
        if self.state_machines:
            state_machines.arrange_in_grid()
        return VGroup(container, state_machines)

```

## Questions

- Is it a coincidence that the 3 core languages all have suitable native concurrent task execution frameworks? Would any additional challenges arise when using core with a custom scheduler?
- “We don’t even need to implement run_until_complete or run_forever, because we always only ever want to run one iteration of the event loop.” Why are there no situations where we want to run multiple iterations? E.g. two coroutines ping-pong using `workflow.wait_condition()` ?

[Python](https://www.notion.so/Python-0b8d9d6768e344faa637ba325fdef80d?pvs=21)