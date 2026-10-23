// Cloudinary delivery transformations for display. Downloads always use the
// original URL so listing images keep full quality.
const PRESETS = {
  mini: 'c_fill,w_120,h_120,q_auto,f_auto',
  thumb: 'c_fill,w_480,h_480,q_auto,f_auto',
  large: 'c_limit,w_1400,h_1400,q_auto,f_auto',
};

export function displayImage(url, preset = 'thumb') {
  if (!url || !PRESETS[preset] || !url.includes('/image/upload/')) return url;
  return url.replace('/image/upload/', `/image/upload/${PRESETS[preset]}/`);
}
