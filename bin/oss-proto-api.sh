git clone --branch oss-1754-pollworkflowexecutionupdate --recursive git@github.com:dandavison/temporalio-temporal.git
cd temporalio-temporal
(cd proto && buf mod prune)
make proto
