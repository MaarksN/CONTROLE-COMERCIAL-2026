
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select adjusted
from "analytics"."main"."commercial_monthly"
where adjusted is null



  
  
      
    ) dbt_internal_test