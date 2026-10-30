export const THEME_KEY = 'ph-theme';

// Runs before first paint (inlined in the root layout) so a saved dark theme
// is applied without a flash. Light is the default.
export const themeInitScript = `try{if(localStorage.getItem('${THEME_KEY}')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`;
