const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf-8');
let url = '', key = '';
envFile.split('\n').forEach(line => {
  if (line.trim().startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.trim().startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim();
  if (line.trim().startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=') && !key) key = line.split('=')[1].trim();
});
url = url.replace(/['"]+/g, '');
key = key.replace(/['"]+/g, '');
const supabase = createClient(url, key);

async function check() {
  const t1 = await supabase.from('pagos_abonos').select('*').limit(1);
  console.log('pagos keys:', t1.data && t1.data[0] ? Object.keys(t1.data[0]) : t1.error);
  
  const t2 = await supabase.from('egresos').select('*').limit(1);
  console.log('egresos keys:', t2.data && t2.data[0] ? Object.keys(t2.data[0]) : t2.error);

  const t3 = await supabase.from('movimientos_saldo_favor').select('*').limit(1);
  console.log('saldo keys:', t3.data && t3.data[0] ? Object.keys(t3.data[0]) : t3.error);
}
check();
