export const THEME_KEY = 'ph-theme';

// Runs before first paint (inlined in the root layout) so the saved theme
// is applied without a flash of the wrong colours.
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
