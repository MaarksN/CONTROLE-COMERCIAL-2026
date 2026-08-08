import json
from pathlib import Path

import great_expectations as gx
import great_expectations.expectations as gxe
import pandas as pd


source_path = Path("app/data/commercial-data.json")
source = json.loads(source_path.read_text(encoding="utf-8"))
frame = pd.DataFrame(source["monthlyMetrics"])

context = gx.get_context(mode="ephemeral")
data_source = context.data_sources.add_pandas("commercial_data")
asset = data_source.add_dataframe_asset(name="monthly_metrics")
batch_definition = asset.add_batch_definition_whole_dataframe("all_months")

suite = gx.ExpectationSuite(name="commercial_monthly_quality")
suite.add_expectation(gxe.ExpectColumnValuesToNotBeNull(column="month"))
suite.add_expectation(gxe.ExpectColumnValuesToBeBetween(column="monthNumber", min_value=1, max_value=12))
suite.add_expectation(gxe.ExpectColumnValuesToBeUnique(column="monthNumber"))
suite.add_expectation(gxe.ExpectColumnValuesToBeBetween(column="target", min_value=0))
suite.add_expectation(gxe.ExpectColumnValuesToBeBetween(column="sold", min_value=0))
context.suites.add(suite)

definition = gx.ValidationDefinition(
    name="commercial_monthly_validation",
    data=batch_definition,
    suite=suite,
)
validation = context.validation_definitions.add(definition)
result = validation.run(batch_parameters={"dataframe": frame})

print(f"Great Expectations: {result.statistics['successful_expectations']}/{result.statistics['evaluated_expectations']} regras aprovadas")
if not result.success:
    raise SystemExit(1)
