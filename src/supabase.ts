import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zmponzzwktalnrsszezb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptcG9uenp3a3RhbG5yc3N6ZXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMzkyNzQsImV4cCI6MjA5MDYxNTI3NH0.nPLsMsADBysIcQ_BEjaaN4VV9pQXHvZTbDEM2eaTk3g';

export const supabase = createClient(supabaseUrl, supabaseKey);