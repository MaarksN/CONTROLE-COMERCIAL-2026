
    
    

select
    month_number as unique_field,
    count(*) as n_records

from "analytics"."main"."commercial_monthly"
where month_number is not null
group by month_number
having count(*) > 1


