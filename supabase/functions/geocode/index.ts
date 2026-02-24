import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { address } = await req.json()
    
    if (!address || typeof address !== 'string' || !address.trim()) {
      console.log("[geocode] Missing or empty address")
      return new Response(JSON.stringify({ error: "Address is required" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log("[geocode] Geocoding address:", address)

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`
    
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'VISIOEDRE-App/1.0' },
    })

    if (!resp.ok) {
      console.error("[geocode] Nominatim returned status:", resp.status)
      return new Response(JSON.stringify({ error: "Geocoding service error" }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await resp.json()
    console.log("[geocode] Results count:", data.length)

    if (data.length === 0) {
      return new Response(JSON.stringify({ result: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    }

    console.log("[geocode] Found:", result.displayName, result.lat, result.lng)

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error("[geocode] Error:", err)
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
