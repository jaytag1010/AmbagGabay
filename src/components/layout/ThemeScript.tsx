export function ThemeScript() { return <script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem('ambag-theme')||'light'}catch(e){}` }} />; }
