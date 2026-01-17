
import { corsHeaders } from './cors.ts';

export function errorResp(message: string, status = 400, body: object = {}) {
    console.error(message);
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Connection': 'keep-alive'
            }
        }
    );
}

export function successResp(body: object = {}, status = 200) {
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Connection': 'keep-alive'
            }
        }
    );
}