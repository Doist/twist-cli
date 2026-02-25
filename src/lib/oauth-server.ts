import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { parse } from 'node:url'

export const PORT = 8766
export const OAUTH_REDIRECT_URI = 'http://localhost:8766/callback'

// 3 minute timeout for OAuth flow
const TIMEOUT_MS = 3 * 60 * 1000

interface CallbackResult {
    code: string
    cleanup: () => void
}

/**
 * Start a local HTTP server to handle OAuth callback
 * Returns a promise that resolves when the callback is received with valid state
 */
export async function startCallbackServer(expectedState: string): Promise<CallbackResult> {
    return new Promise((resolve, reject) => {
        let server: Server | null = null
        let timeoutId: NodeJS.Timeout | null = null
        let resolved = false

        const cleanup = () => {
            if (resolved) return
            resolved = true

            if (timeoutId) {
                clearTimeout(timeoutId)
                timeoutId = null
            }

            if (server) {
                server.close()
                server = null
            }
        }

        // Set up timeout
        timeoutId = setTimeout(() => {
            cleanup()
            reject(new Error('OAuth flow timed out. Please try again.'))
        }, TIMEOUT_MS)

        // Create HTTP server
        server = createServer((req: IncomingMessage, res: ServerResponse) => {
            const url = parse(req.url || '', true)

            if (url.pathname === '/callback') {
                handleCallback(req, res, expectedState, resolve, reject, cleanup)
            } else {
                // Handle other paths
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(getNotFoundPage())
            }
        })

        // Handle server errors
        server.on('error', (error) => {
            cleanup()
            if (error.message.includes('EADDRINUSE')) {
                reject(
                    new Error(
                        `Port ${PORT} is already in use. Please close any other applications using this port and try again.`,
                    ),
                )
            } else {
                reject(new Error(`Server error: ${error.message}`))
            }
        })

        // Start listening
        server.listen(PORT, 'localhost', () => {
            console.log(`OAuth callback server listening on ${OAUTH_REDIRECT_URI}`)
        })
    })
}

function handleCallback(
    req: IncomingMessage,
    res: ServerResponse,
    expectedState: string,
    resolve: (result: CallbackResult) => void,
    reject: (error: Error) => void,
    cleanup: () => void,
) {
    const url = parse(req.url || '', true)
    const { code, state, error, error_description } = url.query

    // Check for OAuth errors first
    if (error) {
        const errorMsg = error_description ? String(error_description) : String(error)
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(getErrorPage(`OAuth Error: ${errorMsg}`))
        cleanup()
        reject(new Error(`OAuth authorization failed: ${errorMsg}`))
        return
    }

    // Validate state parameter (CSRF protection)
    if (!state || String(state) !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(getErrorPage('Invalid state parameter. This may be a security issue.'))
        cleanup()
        reject(new Error('Invalid state parameter received. Possible CSRF attack.'))
        return
    }

    // Validate authorization code
    if (!code || typeof code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(getErrorPage('No authorization code received.'))
        cleanup()
        reject(new Error('No authorization code received from OAuth server'))
        return
    }

    // Success!
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(getSuccessPage())

    resolve({
        code: String(code),
        cleanup,
    })
}

function getSuccessPage(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connected - Twist CLI</title>
    <style>
        :root {
            --bg: #fafaf8;
            --surface: #ffffff;
            --border: rgba(0, 0, 0, 0.07);
            --text: #1d1d1f;
            --text-secondary: #6e6e73;
            --text-muted: #aeaeb2;
            --twist-teal: #0dbed9;
            --twist-teal-soft: rgba(13, 190, 217, 0.06);
            --green: #058527;
            --terminal-bg: #1a1b26;
            --terminal-text: #c0caf5;
            --terminal-muted: #565f89;
            --terminal-green: #9ece6a;
            --radius: 16px;
            --radius-sm: 10px;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
            --shadow: 0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
        }
        body::before {
            content: '';
            position: fixed;
            top: -200px;
            left: 50%;
            transform: translateX(-50%);
            width: 800px;
            height: 500px;
            background: radial-gradient(ellipse, rgba(13, 190, 217, 0.07) 0%, transparent 70%);
            pointer-events: none;
        }
        .container {
            max-width: 480px;
            width: 100%;
            margin: 0 auto;
            padding: 48px 24px;
            animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header {
            text-align: center;
            margin-bottom: 32px;
        }
        .logo-wrap {
            width: 72px;
            height: 72px;
            margin: 0 auto 20px;
            position: relative;
        }
        .logo-wrap svg {
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
        }
        .badge {
            position: absolute;
            bottom: -4px;
            right: -4px;
            width: 26px;
            height: 26px;
            background: var(--green);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 0 3px var(--bg), 0 2px 8px rgba(5, 133, 39, 0.3);
            animation: pop 0.35s ease-out 0.3s both;
        }
        @keyframes pop {
            from { transform: scale(0); }
            70% { transform: scale(1.15); }
            to { transform: scale(1); }
        }
        .badge svg { width: 14px; height: 14px; color: white; }
        h1 {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 4px;
        }
        .subtitle { font-size: 15px; color: var(--text-secondary); }
        .terminal {
            background: var(--terminal-bg);
            border-radius: var(--radius);
            overflow: hidden;
            margin-bottom: 16px;
            box-shadow: var(--shadow);
        }
        .terminal-bar {
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .dots { display: flex; gap: 6px; }
        .dot { width: 12px; height: 12px; border-radius: 50%; }
        .dot-r { background: #ff5f57; }
        .dot-y { background: #febc2e; }
        .dot-g { background: #28c840; }
        .terminal-title {
            flex: 1;
            text-align: center;
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 11px;
            color: var(--terminal-muted);
            margin-right: 48px;
        }
        .terminal-body { padding: 16px 20px; }
        .line {
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 13px;
            margin-bottom: 8px;
            line-height: 1.5;
            color: var(--terminal-text);
        }
        .line:last-child { margin-bottom: 0; }
        .ps { color: var(--twist-teal); user-select: none; font-weight: 500; }
        .arg { color: var(--terminal-green); }
        .out {
            color: var(--terminal-muted);
            padding-left: 18px;
            margin-top: -4px;
            margin-bottom: 8px;
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
        }
        .out-ok { color: var(--terminal-green); }
        .cursor {
            display: inline-block;
            width: 8px;
            height: 16px;
            background: var(--twist-teal);
            border-radius: 1px;
            animation: blink 1.2s step-end infinite;
        }
        @keyframes blink {
            0%, 50% { opacity: 1; }
            50.01%, 100% { opacity: 0; }
        }
        .info {
            padding: 16px 18px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            display: flex;
            gap: 14px;
            align-items: flex-start;
            box-shadow: var(--shadow-sm);
        }
        .info-icon {
            flex-shrink: 0;
            width: 34px;
            height: 34px;
            background: var(--twist-teal-soft);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .info-icon svg { width: 16px; height: 16px; color: var(--twist-teal); }
        .info-text h4 { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
        .info-text p { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
        .info-text code {
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
            background: var(--twist-teal-soft);
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--twist-teal);
        }
        footer {
            margin-top: 20px;
            text-align: center;
            font-size: 12px;
            color: var(--text-muted);
        }
        .pill {
            display: inline-block;
            padding: 8px 14px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 999px;
            box-shadow: var(--shadow-sm);
        }
        .gh { margin-top: 10px; }
        .gh a {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 12px;
            transition: color 0.2s;
        }
        .gh a:hover { color: var(--twist-teal); }
        .gh svg { width: 14px; height: 14px; }
        @media (max-width: 480px) {
            .container { padding: 32px 16px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="logo-wrap">
                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g id="Size=72, Style=Color">
                    <g id="TW CLI">
                    <rect x="3" y="3" width="66" height="66" rx="12" fill="#858585"/>
                    <g id="Terminal" filter="url(#filter0_iiiiiiii_12865_372)">
                    <rect x="4.83334" y="4.83325" width="62.3333" height="62.3333" rx="11" fill="#4E5E60"/>
                    <rect x="4.83334" y="4.83325" width="62.3333" height="62.3333" rx="11" fill="url(#paint0_radial_12865_372)" fill-opacity="0.8"/>
                    <g id="Twist">
                    <g id="Twist_2" filter="url(#filter1_ddii_12865_372)">
                    <path d="M29.1253 11.6726C31.6564 11.6728 33.7082 13.7246 33.7083 16.2556V29.0896C33.7082 31.6206 31.6564 33.6724 29.1253 33.6726H16.2914C13.7603 33.6724 11.7085 31.6206 11.7083 29.0896V18.0525H18.4447C18.5013 18.0525 18.5334 18.0484 18.5335 17.9753C18.5335 17.9213 18.4881 17.8873 18.3841 17.8591C18.2887 17.8333 11.8908 16.1208 11.7122 16.073C11.8083 13.6266 13.8215 11.6728 16.2914 11.6726H29.1253ZM27.9007 19.1521C27.8 19.1522 27.7466 19.1833 27.7005 19.2097L27.6976 19.2117L21.3783 22.8005L19.638 23.7888C19.318 23.9707 19.1937 24.2343 19.1937 24.5466V28.28C19.1937 28.5623 19.4816 28.6945 19.7035 28.5583L23.2621 26.3699L23.266 26.3728L23.2679 26.3748L24.8919 27.4773C24.9181 27.495 24.9424 27.4987 24.9564 27.4988C25.0074 27.4988 25.0464 27.4709 25.0619 27.4177L25.8246 24.7937L25.8314 24.7898L27.804 23.5769C28.0636 23.4172 28.2209 23.1369 28.221 22.8357V19.5281C28.221 19.2822 28.0817 19.1521 27.9007 19.1521ZM23.6117 18.5193C23.6012 18.521 23.5928 18.5225 23.5882 18.5232C23.5882 18.5232 15.1329 19.732 14.8265 19.7791C14.5245 19.8255 14.3499 20.0542 14.3499 20.3328V23.7634C14.35 24.0653 14.5855 24.2599 14.8773 24.2029L16.4046 23.9031C16.4175 23.9006 16.4269 23.889 16.4271 23.8757V22.3035C16.4271 21.8888 16.4828 21.6781 16.8236 21.5564L24.0179 19.4001C24.0296 19.3966 24.0374 19.3861 24.0374 19.3738V18.7722C24.0374 18.594 23.9607 18.493 23.8363 18.4929C23.778 18.4929 23.6642 18.5108 23.6117 18.5193Z" fill="#0DBED9"/>
                    <path d="M29.1253 11.6726C31.6564 11.6728 33.7082 13.7246 33.7083 16.2556V29.0896C33.7082 31.6206 31.6564 33.6724 29.1253 33.6726H16.2914C13.7603 33.6724 11.7085 31.6206 11.7083 29.0896V18.0525H18.4447C18.5013 18.0525 18.5334 18.0484 18.5335 17.9753C18.5335 17.9213 18.4881 17.8873 18.3841 17.8591C18.2887 17.8333 11.8908 16.1208 11.7122 16.073C11.8083 13.6266 13.8215 11.6728 16.2914 11.6726H29.1253ZM27.9007 19.1521C27.8 19.1522 27.7466 19.1833 27.7005 19.2097L27.6976 19.2117L21.3783 22.8005L19.638 23.7888C19.318 23.9707 19.1937 24.2343 19.1937 24.5466V28.28C19.1937 28.5623 19.4816 28.6945 19.7035 28.5583L23.2621 26.3699L23.266 26.3728L23.2679 26.3748L24.8919 27.4773C24.9181 27.495 24.9424 27.4987 24.9564 27.4988C25.0074 27.4988 25.0464 27.4709 25.0619 27.4177L25.8246 24.7937L25.8314 24.7898L27.804 23.5769C28.0636 23.4172 28.2209 23.1369 28.221 22.8357V19.5281C28.221 19.2822 28.0817 19.1521 27.9007 19.1521ZM23.6117 18.5193C23.6012 18.521 23.5928 18.5225 23.5882 18.5232C23.5882 18.5232 15.1329 19.732 14.8265 19.7791C14.5245 19.8255 14.3499 20.0542 14.3499 20.3328V23.7634C14.35 24.0653 14.5855 24.2599 14.8773 24.2029L16.4046 23.9031C16.4175 23.9006 16.4269 23.889 16.4271 23.8757V22.3035C16.4271 21.8888 16.4828 21.6781 16.8236 21.5564L24.0179 19.4001C24.0296 19.3966 24.0374 19.3861 24.0374 19.3738V18.7722C24.0374 18.594 23.9607 18.493 23.8363 18.4929C23.778 18.4929 23.6642 18.5108 23.6117 18.5193Z" fill="url(#paint1_linear_12865_372)" fill-opacity="0.3" style="mix-blend-mode:color-burn"/>
                    </g>
                    <path id="Cutout" d="M27.9007 19.1523C28.0816 19.1523 28.2209 19.2817 28.221 19.5273V22.835C28.221 23.1362 28.0635 23.4163 27.804 23.5762L25.8314 24.7891L25.8246 24.7939L25.0619 27.418C25.0464 27.471 25.0073 27.499 24.9564 27.499C24.9424 27.499 24.9181 27.4953 24.8919 27.4775L23.2679 26.374L23.266 26.373L23.2621 26.3701L19.7035 28.5586C19.4816 28.6947 19.1937 28.5625 19.1937 28.2803V24.5459C19.1938 24.2338 19.3182 23.9709 19.638 23.7891L21.3783 22.8008L27.6976 19.2119L27.7005 19.21C27.7467 19.1835 27.7999 19.1524 27.9007 19.1523ZM23.8363 18.4922C23.9607 18.4923 24.0374 18.5943 24.0374 18.7725V19.374C24.0373 19.3863 24.0295 19.3969 24.0179 19.4004L16.8236 21.5566C16.4828 21.6784 16.4271 21.8889 16.4271 22.3037V23.875C16.4271 23.8883 16.4176 23.8997 16.4046 23.9023L14.8773 24.2021C14.5855 24.2592 14.3501 24.0655 14.3499 23.7637V20.333C14.3499 20.0545 14.5245 19.8257 14.8265 19.7793C15.1323 19.7323 23.5882 18.5234 23.5882 18.5234C23.5928 18.5228 23.6012 18.5212 23.6117 18.5195C23.6642 18.511 23.778 18.4922 23.8363 18.4922ZM18.3841 17.8594C18.4879 17.8875 18.5333 17.9208 18.5335 17.9746C18.5335 18.0481 18.5014 18.0527 18.4447 18.0527H11.7083V16.0723C11.7083 16.0723 18.2873 17.8331 18.3841 17.8594Z" fill="#2B545B"/>
                    </g>
                    <g id="Underscore" filter="url(#filter2_ddii_12865_372)">
                    <rect x="38.0052" y="30.0417" width="17.4167" height="3.66667" rx="1.83333" fill="#0DBED9"/>
                    <rect x="38.0052" y="30.0417" width="17.4167" height="3.66667" rx="1.83333" fill="url(#paint2_linear_12865_372)" fill-opacity="0.3" style="mix-blend-mode:color-burn"/>
                    </g>
                    </g>
                    </g>
                    </g>
                    <defs>
                    <filter id="filter0_iiiiiiii_12865_372" x="4.83334" y="4.83325" width="62.3333" height="62.3333" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="6.63667"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.94902 0 0 0 0 0.94902 0 0 0 0 0.94902 0 0 0 1 0"/>
                    <feBlend mode="plus-darker" in2="shape" result="effect1_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="1.30167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0"/>
                    <feBlend mode="overlay" in2="effect1_innerShadow_12865_372" result="effect2_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect3_innerShadow_12865_372"/>
                    <feOffset dx="-0.88" dy="-0.88"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
                    <feBlend mode="overlay" in2="effect2_innerShadow_12865_372" result="effect3_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect4_innerShadow_12865_372"/>
                    <feOffset dx="-1.68667" dy="-1.68667"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.14902 0 0 0 0 0.14902 0 0 0 0 0.14902 0 0 0 1 0"/>
                    <feBlend mode="plus-lighter" in2="effect3_innerShadow_12865_372" result="effect4_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dx="-0.22" dy="-0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.45 0"/>
                    <feBlend mode="normal" in2="effect4_innerShadow_12865_372" result="effect5_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect6_innerShadow_12865_372"/>
                    <feOffset dx="0.88" dy="0.88"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
                    <feBlend mode="overlay" in2="effect5_innerShadow_12865_372" result="effect6_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect7_innerShadow_12865_372"/>
                    <feOffset dx="1.68667" dy="1.68667"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 1 0"/>
                    <feBlend mode="plus-lighter" in2="effect6_innerShadow_12865_372" result="effect7_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dx="0.22" dy="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 0"/>
                    <feBlend mode="normal" in2="effect7_innerShadow_12865_372" result="effect8_innerShadow_12865_372"/>
                    </filter>
                    <filter id="filter1_ddii_12865_372" x="7.12501" y="7.08927" width="31.1667" height="31.1667" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="2.29167"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.028646 0 0 0 0 0.553635 0 0 0 0 0.634402 0 0 0 0.7 0"/>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="0.916667"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.027451 0 0 0 0 0.554248 0 0 0 0 0.635294 0 0 0 0.8 0"/>
                    <feBlend mode="normal" in2="effect1_dropShadow_12865_372" result="effect2_dropShadow_12865_372"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_12865_372" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.629032 0 0 0 0 0.83871 0 0 0 0 0.870968 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="shape" result="effect3_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="-0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.1472 0 0 0 0 0.689387 0 0 0 0 0.7728 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="effect3_innerShadow_12865_372" result="effect4_innerShadow_12865_372"/>
                    </filter>
                    <filter id="filter2_ddii_12865_372" x="33.4219" y="25.4584" width="26.5833" height="12.8334" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="2.29167"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.028646 0 0 0 0 0.553635 0 0 0 0 0.634402 0 0 0 0.7 0"/>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="0.916667"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.027451 0 0 0 0 0.554248 0 0 0 0 0.635294 0 0 0 0.8 0"/>
                    <feBlend mode="normal" in2="effect1_dropShadow_12865_372" result="effect2_dropShadow_12865_372"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_12865_372" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.629032 0 0 0 0 0.83871 0 0 0 0 0.870968 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="shape" result="effect3_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="-0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.1472 0 0 0 0 0.689387 0 0 0 0 0.7728 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="effect3_innerShadow_12865_372" result="effect4_innerShadow_12865_372"/>
                    </filter>
                    <radialGradient id="paint0_radial_12865_372" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(36 24.9084) rotate(90) scale(44.8021 44.9389)">
                    <stop stop-opacity="0"/>
                    <stop offset="1"/>
                    </radialGradient>
                    <linearGradient id="paint1_linear_12865_372" x1="31.1875" y1="13.0835" x2="12.5429" y2="33.7019" gradientUnits="userSpaceOnUse">
                    <stop stop-color="white"/>
                    <stop offset="1" stop-color="#002C33"/>
                    </linearGradient>
                    <linearGradient id="paint2_linear_12865_372" x1="51.9748" y1="30.5192" x2="50.9651" y2="35.9852" gradientUnits="userSpaceOnUse">
                    <stop stop-color="white"/>
                    <stop offset="1" stop-color="#002C33"/>
                    </linearGradient>
                    </defs>
                </svg>
                <div class="badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
            </div>
            <h1>You're connected</h1>
            <p class="subtitle">Twist CLI is now authenticated</p>
        </header>

        <div class="terminal">
            <div class="terminal-bar">
                <div class="dots">
                    <span class="dot dot-r"></span>
                    <span class="dot dot-y"></span>
                    <span class="dot dot-g"></span>
                </div>
                <span class="terminal-title">Terminal</span>
            </div>
            <div class="terminal-body">
                <div class="line">
                    <span class="ps">$</span>
                    <span>tw</span>
                    <span class="arg">inbox</span>
                </div>
                <div class="out out-ok">5 unread threads</div>
                <div class="line">
                    <span class="ps">$</span>
                    <span>tw</span>
                    <span class="arg">compose</span>
                    <span>"Weekly update"</span>
                </div>
                <div class="out out-ok">Thread posted</div>
                <div class="line">
                    <span class="ps">$</span>
                    <span class="cursor"></span>
                </div>
            </div>
        </div>

        <div class="info">
            <div class="info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                </svg>
            </div>
            <div class="info-text">
                <h4>Return to your terminal</h4>
                <p>You can close this window. Run <code>tw --help</code> to see available commands.</p>
            </div>
        </div>

        <footer>
            <p class="pill">Closing in <span id="countdown">30</span> seconds...</p>
            <p class="gh">
                <a href="https://github.com/Doist/twist-cli" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    View on GitHub
                </a>
            </p>
        </footer>
    </div>
    <script>
        let seconds = 30;
        const el = document.getElementById('countdown');
        const t = setInterval(() => {
            if (--seconds > 0) { el.textContent = seconds; }
            else { clearInterval(t); el.parentElement.textContent = 'You can close this window.'; }
        }, 1000);
    </script>
</body>
</html>`
}

function getErrorPage(errorMessage: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - Twist CLI</title>
    <style>
        :root {
            --bg: #fafaf8;
            --surface: #ffffff;
            --border: rgba(0, 0, 0, 0.07);
            --text: #1d1d1f;
            --text-secondary: #6e6e73;
            --red: #e44332;
            --red-soft: rgba(228, 67, 50, 0.06);
            --radius: 12px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-font-smoothing: antialiased;
        }
        .container {
            text-align: center;
            padding: 48px 24px;
            max-width: 480px;
            animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .logo {
            width: 72px;
            height: 72px;
            margin: 0 auto 20px;
            position: relative;
        }
        .logo svg {
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
        }
        .badge {
            position: absolute;
            bottom: -4px;
            right: -4px;
            width: 26px;
            height: 26px;
            background: var(--red);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 0 3px var(--bg), 0 2px 8px rgba(228, 67, 50, 0.3);
        }
        .badge svg { width: 14px; height: 14px; color: white; }
        h1 {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 6px;
        }
        p { font-size: 15px; color: var(--text-secondary); line-height: 1.6; }
        .hint {
            margin-top: 24px;
            padding: 16px 20px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            font-size: 13px;
            color: var(--text-secondary);
        }
        .hint code {
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
            background: var(--red-soft);
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--red);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g id="Size=72, Style=Color">
                    <g id="TW CLI">
                    <rect x="3" y="3" width="66" height="66" rx="12" fill="#858585"/>
                    <g id="Terminal" filter="url(#filter0_iiiiiiii_12865_372)">
                    <rect x="4.83334" y="4.83325" width="62.3333" height="62.3333" rx="11" fill="#4E5E60"/>
                    <rect x="4.83334" y="4.83325" width="62.3333" height="62.3333" rx="11" fill="url(#paint0_radial_12865_372)" fill-opacity="0.8"/>
                    <g id="Twist">
                    <g id="Twist_2" filter="url(#filter1_ddii_12865_372)">
                    <path d="M29.1253 11.6726C31.6564 11.6728 33.7082 13.7246 33.7083 16.2556V29.0896C33.7082 31.6206 31.6564 33.6724 29.1253 33.6726H16.2914C13.7603 33.6724 11.7085 31.6206 11.7083 29.0896V18.0525H18.4447C18.5013 18.0525 18.5334 18.0484 18.5335 17.9753C18.5335 17.9213 18.4881 17.8873 18.3841 17.8591C18.2887 17.8333 11.8908 16.1208 11.7122 16.073C11.8083 13.6266 13.8215 11.6728 16.2914 11.6726H29.1253ZM27.9007 19.1521C27.8 19.1522 27.7466 19.1833 27.7005 19.2097L27.6976 19.2117L21.3783 22.8005L19.638 23.7888C19.318 23.9707 19.1937 24.2343 19.1937 24.5466V28.28C19.1937 28.5623 19.4816 28.6945 19.7035 28.5583L23.2621 26.3699L23.266 26.3728L23.2679 26.3748L24.8919 27.4773C24.9181 27.495 24.9424 27.4987 24.9564 27.4988C25.0074 27.4988 25.0464 27.4709 25.0619 27.4177L25.8246 24.7937L25.8314 24.7898L27.804 23.5769C28.0636 23.4172 28.2209 23.1369 28.221 22.8357V19.5281C28.221 19.2822 28.0817 19.1521 27.9007 19.1521ZM23.6117 18.5193C23.6012 18.521 23.5928 18.5225 23.5882 18.5232C23.5882 18.5232 15.1329 19.732 14.8265 19.7791C14.5245 19.8255 14.3499 20.0542 14.3499 20.3328V23.7634C14.35 24.0653 14.5855 24.2599 14.8773 24.2029L16.4046 23.9031C16.4175 23.9006 16.4269 23.889 16.4271 23.8757V22.3035C16.4271 21.8888 16.4828 21.6781 16.8236 21.5564L24.0179 19.4001C24.0296 19.3966 24.0374 19.3861 24.0374 19.3738V18.7722C24.0374 18.594 23.9607 18.493 23.8363 18.4929C23.778 18.4929 23.6642 18.5108 23.6117 18.5193Z" fill="#0DBED9"/>
                    <path d="M29.1253 11.6726C31.6564 11.6728 33.7082 13.7246 33.7083 16.2556V29.0896C33.7082 31.6206 31.6564 33.6724 29.1253 33.6726H16.2914C13.7603 33.6724 11.7085 31.6206 11.7083 29.0896V18.0525H18.4447C18.5013 18.0525 18.5334 18.0484 18.5335 17.9753C18.5335 17.9213 18.4881 17.8873 18.3841 17.8591C18.2887 17.8333 11.8908 16.1208 11.7122 16.073C11.8083 13.6266 13.8215 11.6728 16.2914 11.6726H29.1253ZM27.9007 19.1521C27.8 19.1522 27.7466 19.1833 27.7005 19.2097L27.6976 19.2117L21.3783 22.8005L19.638 23.7888C19.318 23.9707 19.1937 24.2343 19.1937 24.5466V28.28C19.1937 28.5623 19.4816 28.6945 19.7035 28.5583L23.2621 26.3699L23.266 26.3728L23.2679 26.3748L24.8919 27.4773C24.9181 27.495 24.9424 27.4987 24.9564 27.4988C25.0074 27.4988 25.0464 27.4709 25.0619 27.4177L25.8246 24.7937L25.8314 24.7898L27.804 23.5769C28.0636 23.4172 28.2209 23.1369 28.221 22.8357V19.5281C28.221 19.2822 28.0817 19.1521 27.9007 19.1521ZM23.6117 18.5193C23.6012 18.521 23.5928 18.5225 23.5882 18.5232C23.5882 18.5232 15.1329 19.732 14.8265 19.7791C14.5245 19.8255 14.3499 20.0542 14.3499 20.3328V23.7634C14.35 24.0653 14.5855 24.2599 14.8773 24.2029L16.4046 23.9031C16.4175 23.9006 16.4269 23.889 16.4271 23.8757V22.3035C16.4271 21.8888 16.4828 21.6781 16.8236 21.5564L24.0179 19.4001C24.0296 19.3966 24.0374 19.3861 24.0374 19.3738V18.7722C24.0374 18.594 23.9607 18.493 23.8363 18.4929C23.778 18.4929 23.6642 18.5108 23.6117 18.5193Z" fill="url(#paint1_linear_12865_372)" fill-opacity="0.3" style="mix-blend-mode:color-burn"/>
                    </g>
                    <path id="Cutout" d="M27.9007 19.1523C28.0816 19.1523 28.2209 19.2817 28.221 19.5273V22.835C28.221 23.1362 28.0635 23.4163 27.804 23.5762L25.8314 24.7891L25.8246 24.7939L25.0619 27.418C25.0464 27.471 25.0073 27.499 24.9564 27.499C24.9424 27.499 24.9181 27.4953 24.8919 27.4775L23.2679 26.374L23.266 26.373L23.2621 26.3701L19.7035 28.5586C19.4816 28.6947 19.1937 28.5625 19.1937 28.2803V24.5459C19.1938 24.2338 19.3182 23.9709 19.638 23.7891L21.3783 22.8008L27.6976 19.2119L27.7005 19.21C27.7467 19.1835 27.7999 19.1524 27.9007 19.1523ZM23.8363 18.4922C23.9607 18.4923 24.0374 18.5943 24.0374 18.7725V19.374C24.0373 19.3863 24.0295 19.3969 24.0179 19.4004L16.8236 21.5566C16.4828 21.6784 16.4271 21.8889 16.4271 22.3037V23.875C16.4271 23.8883 16.4176 23.8997 16.4046 23.9023L14.8773 24.2021C14.5855 24.2592 14.3501 24.0655 14.3499 23.7637V20.333C14.3499 20.0545 14.5245 19.8257 14.8265 19.7793C15.1323 19.7323 23.5882 18.5234 23.5882 18.5234C23.5928 18.5228 23.6012 18.5212 23.6117 18.5195C23.6642 18.511 23.778 18.4922 23.8363 18.4922ZM18.3841 17.8594C18.4879 17.8875 18.5333 17.9208 18.5335 17.9746C18.5335 18.0481 18.5014 18.0527 18.4447 18.0527H11.7083V16.0723C11.7083 16.0723 18.2873 17.8331 18.3841 17.8594Z" fill="#2B545B"/>
                    </g>
                    <g id="Underscore" filter="url(#filter2_ddii_12865_372)">
                    <rect x="38.0052" y="30.0417" width="17.4167" height="3.66667" rx="1.83333" fill="#0DBED9"/>
                    <rect x="38.0052" y="30.0417" width="17.4167" height="3.66667" rx="1.83333" fill="url(#paint2_linear_12865_372)" fill-opacity="0.3" style="mix-blend-mode:color-burn"/>
                    </g>
                    </g>
                    </g>
                    </g>
                    <defs>
                    <filter id="filter0_iiiiiiii_12865_372" x="4.83334" y="4.83325" width="62.3333" height="62.3333" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="6.63667"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.94902 0 0 0 0 0.94902 0 0 0 0 0.94902 0 0 0 1 0"/>
                    <feBlend mode="plus-darker" in2="shape" result="effect1_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="1.30167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0"/>
                    <feBlend mode="overlay" in2="effect1_innerShadow_12865_372" result="effect2_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect3_innerShadow_12865_372"/>
                    <feOffset dx="-0.88" dy="-0.88"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
                    <feBlend mode="overlay" in2="effect2_innerShadow_12865_372" result="effect3_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect4_innerShadow_12865_372"/>
                    <feOffset dx="-1.68667" dy="-1.68667"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.14902 0 0 0 0 0.14902 0 0 0 0 0.14902 0 0 0 1 0"/>
                    <feBlend mode="plus-lighter" in2="effect3_innerShadow_12865_372" result="effect4_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dx="-0.22" dy="-0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.45 0"/>
                    <feBlend mode="normal" in2="effect4_innerShadow_12865_372" result="effect5_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect6_innerShadow_12865_372"/>
                    <feOffset dx="0.88" dy="0.88"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
                    <feBlend mode="overlay" in2="effect5_innerShadow_12865_372" result="effect6_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect7_innerShadow_12865_372"/>
                    <feOffset dx="1.68667" dy="1.68667"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 1 0"/>
                    <feBlend mode="plus-lighter" in2="effect6_innerShadow_12865_372" result="effect7_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dx="0.22" dy="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 0"/>
                    <feBlend mode="normal" in2="effect7_innerShadow_12865_372" result="effect8_innerShadow_12865_372"/>
                    </filter>
                    <filter id="filter1_ddii_12865_372" x="7.12501" y="7.08927" width="31.1667" height="31.1667" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="2.29167"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.028646 0 0 0 0 0.553635 0 0 0 0 0.634402 0 0 0 0.7 0"/>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="0.916667"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.027451 0 0 0 0 0.554248 0 0 0 0 0.635294 0 0 0 0.8 0"/>
                    <feBlend mode="normal" in2="effect1_dropShadow_12865_372" result="effect2_dropShadow_12865_372"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_12865_372" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.629032 0 0 0 0 0.83871 0 0 0 0 0.870968 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="shape" result="effect3_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="-0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.1472 0 0 0 0 0.689387 0 0 0 0 0.7728 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="effect3_innerShadow_12865_372" result="effect4_innerShadow_12865_372"/>
                    </filter>
                    <filter id="filter2_ddii_12865_372" x="33.4219" y="25.4584" width="26.5833" height="12.8334" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="2.29167"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.028646 0 0 0 0 0.553635 0 0 0 0 0.634402 0 0 0 0.7 0"/>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="0.916667"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.027451 0 0 0 0 0.554248 0 0 0 0 0.635294 0 0 0 0.8 0"/>
                    <feBlend mode="normal" in2="effect1_dropShadow_12865_372" result="effect2_dropShadow_12865_372"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_12865_372" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.629032 0 0 0 0 0.83871 0 0 0 0 0.870968 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="shape" result="effect3_innerShadow_12865_372"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="-0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.1472 0 0 0 0 0.689387 0 0 0 0 0.7728 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="effect3_innerShadow_12865_372" result="effect4_innerShadow_12865_372"/>
                    </filter>
                    <radialGradient id="paint0_radial_12865_372" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(36 24.9084) rotate(90) scale(44.8021 44.9389)">
                    <stop stop-opacity="0"/>
                    <stop offset="1"/>
                    </radialGradient>
                    <linearGradient id="paint1_linear_12865_372" x1="31.1875" y1="13.0835" x2="12.5429" y2="33.7019" gradientUnits="userSpaceOnUse">
                    <stop stop-color="white"/>
                    <stop offset="1" stop-color="#002C33"/>
                    </linearGradient>
                    <linearGradient id="paint2_linear_12865_372" x1="51.9748" y1="30.5192" x2="50.9651" y2="35.9852" gradientUnits="userSpaceOnUse">
                    <stop stop-color="white"/>
                    <stop offset="1" stop-color="#002C33"/>
                    </linearGradient>
                    </defs>
                </svg>
            <div class="badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </div>
        </div>
        <h1>Authentication failed</h1>
        <p>${errorMessage}</p>
        <div class="hint">Try again with <code>tw auth login</code></div>
    </div>
</body>
</html>`
}

function getNotFoundPage(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Page Not Found - Twist CLI</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .message { color: #333; font-size: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="message">This is the OAuth callback server for Twist CLI. This page should only be accessed during the login process.</div>
    </div>
</body>
</html>`
}
