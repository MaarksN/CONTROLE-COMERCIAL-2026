
    

    create  table
      "analytics"."main"."commercial_monthly__dbt_tmp"
  
    
    as (
      with source as (
    select unnest(monthlyMetrics) as metric
    from read_json_auto('app/data/commercial-data.json')
)

select
    metric.month::varchar as month,
    metric.monthNumber::integer as month_number,
    metric.target::decimal(18, 2) as target,
    metric.sold::decimal(18, 2) as sold,
    metric.adjusted::decimal(18, 2) as adjusted,
    metric.gap::decimal(18, 2) as gap,
    metric.attainment::decimal(9, 4) as attainment,
    metric.health::varchar as health
from source
    );
    
  