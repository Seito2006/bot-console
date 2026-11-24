const lockArt = file => new URL('./avatars/hsr/' + file, import.meta.url).href;
const sticker = file => new URL('./themes/hsr/' + file, import.meta.url).href;

export const HSR_SKINS = [
  { id: 'hsr-stelle', title: 'Stelle', who: 'นีออนและแสงดาว', wall: 'hsr/stelle.jpg', lockWall: lockArt('Stelle.jpg'), emojis: [sticker('stelle.png'), sticker('stelle-2.png')] },
  { id: 'hsr-march', title: 'March 7th', who: 'ฟ้า–ชมพูแบบโพลารอยด์', wall: 'hsr/march-7th.jpg', lockWall: lockArt('March.jpg'), emojis: [sticker('march.png'), sticker('march-2.png')] },
  { id: 'hsr-herta', title: 'The Herta', who: 'ม่วง–ทองแบบหอวิจัย', wall: 'hsr/the-herta.jpg', lockWall: lockArt('the herta.jpg'), emojis: [sticker('herta.png'), sticker('herta-2.png')] },
];

export const hsrSkinById = id => HSR_SKINS.find(skin => skin.id === id);
