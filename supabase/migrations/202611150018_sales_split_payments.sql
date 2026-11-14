-- Split payments for the Sales Cebu import, following each sheet's payment block.
-- The block below the sale rows lists GCash / cheque / named bank deposits per customer;
-- everything else on that day was received in cash. The first import had assigned the
-- whole sale to one method, so e.g. Romel was booked as fully GCash even though only
-- P72,700 of P112,900 came through GCash. This migration splits those sales into one
-- payment row per method; the sum of the rows always equals the sale total.
--
-- It also teaches create_sale to accept an explicit payment split so the New Sale form
-- can record a cash + GCash sale the same way.

begin;

do $$
declare
  v_fix jsonb := $fix$[{"date":"2026-09-18","customer":"RUDY HERANA","total":865000,"payments":[{"method":"bank","amount":865000}]},{"date":"2026-10-02","customer":"SEVEN STAR","total":69000,"payments":[{"method":"cash","amount":50000},{"method":"gcash","amount":19000}]},{"date":"2026-10-09","customer":"ELIZABETH","total":29800,"payments":[{"method":"cash","amount":28900},{"method":"gcash","amount":900}]},{"date":"2026-10-10","customer":"IMY","total":64920,"payments":[{"method":"cash","amount":25000},{"method":"gcash","amount":39920}]},{"date":"2026-10-10","customer":"JOYLEY SY","total":127000,"payments":[{"method":"gcash","amount":127000}]},{"date":"2026-10-12","customer":"MERLINE","total":16110,"payments":[{"method":"gcash","amount":16110}]},{"date":"2026-10-12","customer":"IGO MACTAN","total":346150,"payments":[{"method":"cash","amount":345000},{"method":"gcash","amount":1150}]},{"date":"2026-10-14","customer":"BPI","total":3450,"payments":[{"method":"cash","amount":2300},{"method":"gcash","amount":1150}]},{"date":"2026-10-17","customer":"IMEE","total":86080,"payments":[{"method":"cash","amount":42400},{"method":"gcash","amount":43680}]},{"date":"2026-10-20","customer":"JOYLEY SY","total":128000,"payments":[{"method":"bank","amount":127000},{"method":"gcash","amount":1000}]},{"date":"2026-10-22","customer":"BPI","total":2320,"payments":[{"method":"cash","amount":1160},{"method":"gcash","amount":1160}]},{"date":"2026-10-24","customer":"CHRISTOPHER CHAN","total":11600,"payments":[{"method":"gcash","amount":11600}]},{"date":"2026-10-24","customer":"EMILY TRAPA","total":7800,"payments":[{"method":"cash","amount":6000},{"method":"gcash","amount":1800}]},{"date":"2026-10-26","customer":"JEREMY COCSON","total":57080,"payments":[{"method":"cash","amount":48000},{"method":"gcash","amount":9080}]},{"date":"2026-10-27","customer":"ELLEGOLD MARKETING","total":6900,"payments":[{"method":"gcash","amount":6900}]},{"date":"2026-10-28","customer":"BRIEL GEBILAGUIN","total":9200,"payments":[{"method":"cash","amount":7900},{"method":"gcash","amount":1300}]},{"date":"2026-10-29","customer":"SEVEN STAR","total":94600,"payments":[{"method":"cash","amount":50000},{"method":"gcash","amount":44600}]},{"date":"2026-10-31","customer":"IMEE","total":61475,"payments":[{"method":"cash","amount":45475},{"method":"gcash","amount":16000}]},{"date":"2026-11-04","customer":"ELIZABETH","total":36450,"payments":[{"method":"cash","amount":6450},{"method":"gcash","amount":30000}]},{"date":"2026-11-04","customer":"CESCAR","total":11600,"payments":[{"method":"cash","amount":5000},{"method":"gcash","amount":6600}]},{"date":"2026-11-06","customer":"JUNRY LABAJO","total":1430400,"payments":[{"method":"bank","amount":1430400}]},{"date":"2026-11-06","customer":"CESCAR","total":8120,"payments":[{"method":"cash","amount":5000},{"method":"gcash","amount":3120}]},{"date":"2026-11-07","customer":"IMEE","total":78880,"payments":[{"method":"cash","amount":40580},{"method":"gcash","amount":38300}]},{"date":"2026-11-07","customer":"C/O BOSS","total":530,"payments":[{"method":"gcash","amount":530}]},{"date":"2026-11-11","customer":"UNO VET","total":1416000,"payments":[{"method":"bank","amount":1416000}]},{"date":"2026-11-12","customer":"JIGA FARM","total":24330,"payments":[{"method":"gcash","amount":24330}]},{"date":"2026-11-14","customer":"MARK DURBAN","total":8000,"payments":[{"method":"cash","amount":7000},{"method":"gcash","amount":1000}]},{"date":"2026-11-14","customer":"ROMEL","total":112900,"payments":[{"method":"cash","amount":40200},{"method":"gcash","amount":72700}]},{"date":"2026-11-14","customer":"C/O BOSS","total":540,"payments":[{"method":"gcash","amount":540}]}]$fix$;
  v_row jsonb;
  v_sale uuid;
  v_n integer;
  v_date date;
  v_refs jsonb;
begin
  for v_row in select * from jsonb_array_elements(v_fix)
  loop
    v_date := (v_row->>'date')::date;

    select count(*), (array_agg(s.id))[1]
      into v_n, v_sale
    from public.sales s
    join public.customers c on c.id = s.customer_id
    where s.branch_id = '22222222-2222-2222-2222-222222222222'
      and s.import_key is not null
      and s.sale_date = v_date
      and upper(btrim(c.name)) = upper(btrim(v_row->>'customer'))
      and s.total = (v_row->>'total')::numeric;

    if v_n <> 1 then
      raise exception 'Expected one sale for % on % (found %)', v_row->>'customer', v_date, v_n;
    end if;

    select coalesce(jsonb_object_agg(p.method::text, p.reference_no), '{}'::jsonb)
      into v_refs
    from public.payments p
    where p.sale_id = v_sale and p.reference_no is not null;

    delete from public.payments where sale_id = v_sale;

    insert into public.payments (sale_id, payment_date, amount, method, reference_no)
    select v_sale,
           v_date,
           (p->>'amount')::numeric,
           (p->>'method')::public.payment_method,
           nullif(v_refs->>(p->>'method'), '')
    from jsonb_array_elements(v_row->'payments') p;

    update public.sales s
       set payment_type = (
         select (p->>'method')::public.payment_method
         from jsonb_array_elements(v_row->'payments') p
         order by (p->>'amount')::numeric desc
         limit 1
       )
     where s.id = v_sale;
  end loop;
end $$;

drop function if exists public.create_sale(uuid, uuid, public.payment_method, jsonb, text, text, numeric, integer, date);

create or replace function public.create_sale(
  p_branch_id uuid,
  p_customer_id uuid,
  p_payment_type public.payment_method,
  p_items jsonb,
  p_or_number text default null,
  p_notes text default null,
  p_down_payment numeric default 0,
  p_installment_parts integer default 1,
  p_first_due_date date default null,
  p_payments jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_sale_id uuid;
  v_shift_id uuid;
  v_item jsonb;
  v_pay jsonb;
  v_sku uuid;
  v_sacks numeric;
  v_price numeric;
  v_disc numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_pay_sum numeric := 0;
  v_split boolean := false;
  v_type public.payment_method;
  v_dr text;
  v_plan_id uuid;
  v_part numeric;
  v_i integer;
  v_due date;
  v_paid numeric := 0;
begin
  if not public.can_create_sales() then
    raise exception 'Not allowed to create sales';
  end if;
  perform public.assert_branch_access(p_branch_id);

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale needs at least one item';
  end if;

  if p_payments is not null and jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Payments must be a JSON array';
  end if;
  v_split := p_payments is not null and jsonb_array_length(p_payments) > 0;

  select id into v_shift_id
  from public.cashier_shifts
  where cashier_id = auth.uid()
    and branch_id = p_branch_id
    and status = 'open'
  order by opened_at desc
  limit 1;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku := (v_item->>'sku_id')::uuid;
    v_sacks := (v_item->>'sacks')::numeric;
    v_price := (v_item->>'price_per_sack')::numeric;
    v_disc := coalesce((v_item->>'discount')::numeric, 0);
    v_line := round((v_sacks * v_price) - v_disc, 2);
    if v_sacks <= 0 or v_price < 0 or v_line < 0 then
      raise exception 'Invalid sale line';
    end if;
    if public.stock_on_hand(p_branch_id, v_sku) < v_sacks then
      raise exception 'Insufficient stock for SKU %', v_sku;
    end if;
    v_subtotal := v_subtotal + round(v_sacks * v_price, 2);
    v_total := v_total + v_line;
  end loop;

  if v_split then
    select coalesce(sum((p->>'amount')::numeric), 0) into v_pay_sum
    from jsonb_array_elements(p_payments) p;
    if v_pay_sum <> v_total then
      raise exception 'Payments must add up to the sale total';
    end if;
  end if;

  v_dr := public.next_dr_number(p_branch_id);

  if p_payment_type = 'installment' then
    v_paid := greatest(coalesce(p_down_payment, 0), 0);
    if v_paid > v_total then
      raise exception 'Down payment cannot exceed total';
    end if;
  else
    v_paid := v_total;
  end if;

  v_type := p_payment_type;
  if v_split and p_payment_type <> 'installment' then
    select (p->>'method')::public.payment_method into v_type
    from jsonb_array_elements(p_payments) p
    order by (p->>'amount')::numeric desc
    limit 1;
  end if;

  insert into public.sales (
    branch_id, customer_id, cashier_id, shift_id, payment_type,
    subtotal, discount, total, amount_paid, balance, dr_number, or_number, notes
  ) values (
    p_branch_id, p_customer_id, auth.uid(), v_shift_id, v_type,
    v_subtotal, v_subtotal - v_total, v_total, v_paid, v_total - v_paid, v_dr, p_or_number, p_notes
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku := (v_item->>'sku_id')::uuid;
    v_sacks := (v_item->>'sacks')::numeric;
    v_price := (v_item->>'price_per_sack')::numeric;
    v_disc := coalesce((v_item->>'discount')::numeric, 0);
    v_line := round((v_sacks * v_price) - v_disc, 2);

    insert into public.sale_items (sale_id, sku_id, sacks, price_per_sack, discount, line_total)
    values (v_sale_id, v_sku, v_sacks, v_price, v_disc, v_line);

    insert into public.stock_movements (
      sku_id, branch_id, quantity, movement_type, reference_table, reference_id, note, created_by
    ) values (
      v_sku, p_branch_id, -v_sacks, 'sale', 'sales', v_sale_id, 'Sale DR ' || v_dr, auth.uid()
    );
  end loop;

  if p_payment_type <> 'installment' then
    if v_split then
      for v_pay in select * from jsonb_array_elements(p_payments)
      loop
        if (v_pay->>'amount')::numeric <= 0 then
          raise exception 'Payment amount must be positive';
        end if;
        insert into public.payments (sale_id, amount, method, received_by, reference_no)
        values (
          v_sale_id,
          (v_pay->>'amount')::numeric,
          (v_pay->>'method')::public.payment_method,
          auth.uid(),
          nullif(v_pay->>'reference', '')
        );
      end loop;
    else
      insert into public.payments (sale_id, amount, method, received_by)
      values (v_sale_id, v_total, p_payment_type, auth.uid());
    end if;
  else
    if v_paid > 0 then
      insert into public.payments (sale_id, amount, method, received_by, notes)
      values (v_sale_id, v_paid, 'cash', auth.uid(), 'Down payment');
    end if;

    insert into public.installment_plans (sale_id, total, number_of_parts)
    values (v_sale_id, v_total, greatest(coalesce(p_installment_parts, 1), 1))
    returning id into v_plan_id;

    v_part := round((v_total - v_paid) / greatest(p_installment_parts, 1), 2);
    v_due := coalesce(p_first_due_date, current_date + 30);

    for v_i in 1..greatest(p_installment_parts, 1)
    loop
      insert into public.installment_dues (plan_id, due_date, amount, paid_amount, sequence_no)
      values (
        v_plan_id,
        v_due + ((v_i - 1) * 30),
        case when v_i = greatest(p_installment_parts, 1)
          then (v_total - v_paid) - (v_part * (greatest(p_installment_parts, 1) - 1))
          else v_part
        end,
        0,
        v_i
      );
    end loop;
  end if;

  insert into public.delivery_receipts (sale_id, branch_id, dr_number, printed_at)
  values (v_sale_id, p_branch_id, v_dr, now());

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (
    auth.uid(), 'sale_create', 'sales', v_sale_id,
    jsonb_build_object('total', v_total, 'payment_type', v_type, 'dr_number', v_dr,
                       'split', v_split)
  );

  return v_sale_id;
end;
$fn$;

grant execute on function public.create_sale(uuid, uuid, public.payment_method, jsonb, text, text, numeric, integer, date, jsonb) to authenticated;

commit;
