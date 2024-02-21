# Currently, our poll loops could look something like this:

def getResult(clientMaxWaitTime):
    with cancelInFlightRpcAndThrowAfter(clientMaxWaitTime):
        while True:
            try:
                response = service.pollWorkflowExecutionUpdate(waitFor=COMPLETED)
            except GRPCDeadlineExceeded:
                continue
            else:
                assert response.outcome  # COMPLETED always yields an outcome
                if response.outcome.success:
                    return response.outcome.success.payload
                else:
                    raise AppropriateException.from(response.outcome.failure)

# Now suppose the server changes to respond with an empty outcome in the case
# where everything seems fine, but the gRPC deadline is approaching and the
# requested lifecycle stage hasn't yet been reached. So we can