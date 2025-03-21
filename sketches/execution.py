from dataclasses import dataclass


@dataclass
class MyCheckpointState:
    pass


@dataclass
class MyExecutionOutput:
    pass


def my_execution(checkpointed_state: MyCheckpointState) -> MyExecutionOutput:
    # ...
    return MyExecutionOutput()
