from dbt.cli.main import dbtRunner


result = dbtRunner().invoke(
    ["build", "--project-dir", "analytics/dbt", "--profiles-dir", "analytics/dbt"]
)
if not result.success:
    raise SystemExit(1)
