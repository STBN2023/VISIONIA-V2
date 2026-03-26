import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate the user via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error("[openai-proxy] Missing Authorization header")
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      console.error("[openai-proxy] Auth error:", authError?.message)
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log("[openai-proxy] Authenticated user:", user.id)

    // Get the shared API key from Edge Function Secrets
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      console.error("[openai-proxy] OPENAI_API_KEY secret is not configured")
      return new Response(JSON.stringify({ error: 'Clé API OpenAI non configurée côté serveur. Contactez l\'administrateur.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse the request body (OpenAI chat completion payload)
    const body = await req.json()
    console.log("[openai-proxy] Forwarding request, model:", body.model, "messages:", body.messages?.length)

    // Forward to OpenAI
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const openaiData = await openaiResp.json()

    if (!openaiResp.ok) {
      const errMsg = openaiData?.error?.message || `OpenAI error (status ${openaiResp.status})`
      console.error("[openai-proxy] OpenAI error:", errMsg)
      return new Response(JSON.stringify({ error: errMsg }), {
        status: openaiResp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log("[openai-proxy] Success, usage:", openaiData?.usage)

    return new Response(JSON.stringify(openaiData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error("[openai-proxy] Unexpected error:", e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
