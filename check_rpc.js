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
  const { data, error } = await supabase.rpc('hello_world'); // Just to see if error says 'function not found' or something
  // list rpcss
  const { data: q1 } = await supabase.from('pg_proc').select('proname'); // Only works if exposed, usually not
  console.log('Tested RPC existence.');
}
check();
