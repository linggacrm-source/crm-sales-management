/** Company profile used on printable documents (quotation, PO). */
export const COMPANY = {
  name: "PT WELLRACOM INDUSTRI KOMPUTINDO",
  tagline: "Industrial Computer & Automation Solution",
  logo: "/wellracom-logo.png",
  website: "www.wellkomputindo.id",
  email: "info@wellkomputindo.id",
  offices: [
    {
      city: "Jakarta",
      address: "Epicentrum Walk A707, Rasuna Epicentrum Kuningan, Jl. HR Rasuna Said, Jakarta Selatan 12960",
      phone: "021 2994 1841 / 021 7145 9144",
    },
    {
      city: "Surabaya",
      address: "Jl. Bratang Binangun 83, Surabaya 60284",
      phone: "031 502 8999",
    },
  ],
} as const;

export const DEFAULT_TERMS = [
  "Payment: Termin 30 Hari",
  "Harga FOB Jakarta",
  "Stok ready",
  "Validitas: 14 hari kerja",
] as const;
