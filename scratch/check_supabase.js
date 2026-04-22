const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function test() {
    console.log("Testing Supabase Connection...");
    console.log("URL:", process.env.SUPABASE_URL);
    
    const { data: bucketData, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        console.error("❌ Storage Error:", bucketError.message);
    } else {
        console.log("✅ Storage Access: OK");
        console.log("Available Buckets:", bucketData.map(b => b.name));
    }

    const { data: tableData, error: tableError } = await supabase.from('ownership').select('*').limit(1);
    if (tableError) {
        console.error("❌ Database Error:", tableError.message);
    } else {
        console.log("✅ Database Access: OK");
    }
}

test();
