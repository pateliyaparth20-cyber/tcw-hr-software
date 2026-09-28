"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="loading"><h1>Unable to open this workspace</h1><p>Please try again.</p><button className="btn primary" onClick={reset}>Try again</button></main>}
