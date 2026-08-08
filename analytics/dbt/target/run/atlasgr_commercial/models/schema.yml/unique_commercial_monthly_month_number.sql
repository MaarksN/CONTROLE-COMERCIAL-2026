
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    

select
    month_number as unique_field,
    count(*) as n_records

from "analytics"."main"."commercial_monthly"
where month_number is not null
group by month_number
having count(*) > 1



  
  
      
    ) dbt_internal_test