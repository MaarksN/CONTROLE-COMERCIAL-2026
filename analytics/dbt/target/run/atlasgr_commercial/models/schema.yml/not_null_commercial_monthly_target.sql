
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select target
from "analytics"."main"."commercial_monthly"
where target is null



  
  
      
    ) dbt_internal_test