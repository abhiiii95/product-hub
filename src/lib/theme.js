export const THEME_KEY = 'ph-theme';

// Dark is the default and is rendered on the server. This runs before first
// paint (inlined in the root layout) and switches to light if the user chose it.
export const themeInitScript = `try{if(localStorage.getItem('${THEME_KEY}')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;
