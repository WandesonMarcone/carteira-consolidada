-- Keeps valuation assumptions private per authenticated user and allows the
-- agreed stock methods to save their editable inputs and calculated price.
alter table public.personal_valuations
  drop constraint if exists personal_valuations_method_check;

alter table public.personal_valuations
  add constraint personal_valuations_method_check
  check (method in (
    'graham',
    'bazin',
    'gordon_ddm',
    'lucro_projetado',
    'peter_lynch_peg',
    'multiplos_pares',
    'income_ceiling'
  ));
