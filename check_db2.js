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
  const { data, error } = await supabase.from('vw_movimientos_generales').select('*').limit(3);
  console.log('view sample:', JSON.stringify(data, null, 2));
}

check();
