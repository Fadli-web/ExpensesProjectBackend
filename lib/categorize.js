/**
 * Fallback rule-based sederhana, dipakai jika AI vision tidak berhasil
 * menentukan kategori (mis. gagal parsing JSON) atau untuk input manual.
 */
const RULES = [
  { cat: 'Transportasi', keywords: ['spbu', 'pertamina', 'shell', 'bensin', 'tol', 'parkir', 'grab', 'gojek', 'bbm'] },
  { cat: 'Belanja Harian', keywords: ['indomaret', 'alfamart', 'superindo', 'hypermart', 'supermarket', 'minimarket'] },
  { cat: 'Makanan & Minuman', keywords: ['kopi', 'cafe', 'kafe', 'resto', 'restaurant', 'warung', 'kfc', 'mcdonald', 'kenangan'] },
  { cat: 'Kesehatan', keywords: ['apotek', 'pharmacy', 'klinik', 'rumah sakit', 'kimia farma'] },
  { cat: 'Hiburan', keywords: ['cinema', 'bioskop', 'netflix', 'spotify', 'xxi'] },
  { cat: 'Tagihan', keywords: ['pln', 'pdam', 'indihome', 'listrik', 'wifi', 'telkomsel', 'pulsa'] },
];

export function guessCategory(merchant = '', items = []) {
  const text = `${merchant} ${items.join(' ')}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.cat;
  }
  return 'Lainnya';
}
