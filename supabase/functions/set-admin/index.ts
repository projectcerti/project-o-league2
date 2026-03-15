import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Get caller's JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    // 2. Create service-role client (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 3. Verify the caller's identity
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    // 4. Check caller is the owner (server-side, using service role)
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'owner') {
      return new Response('Forbidden: only the owner can assign roles', { status: 403, headers: corsHeaders })
    }

    // 5. Parse request body
    const { target_user_id, new_role } = await req.json()
    if (!target_user_id || !new_role) {
      return new Response('Bad request: missing target_user_id or new_role', { status: 400, headers: corsHeaders })
    }
    if (!['user', 'admin'].includes(new_role)) {
      return new Response('Bad request: role must be user or admin', { status: 400, headers: corsHeaders })
    }

    // 6. Update the role using service role key (bypasses trigger)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ role: new_role, is_admin: new_role === 'admin' })
      .eq('id', target_user_id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
