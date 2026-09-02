export type SkiLengthRow = {
  ability: string;
  height: string;
  length: string;
};

export const SKI_LENGTH_ROWS: SkiLengthRow[] = [
  { ability: "Beginner", height: "4'10\" / 147cm", length: "125–135cm" },
  { ability: "Beginner", height: "5'2\" / 157cm", length: "135–145cm" },
  { ability: "Beginner", height: "5'6\" / 168cm", length: "140–150cm" },
  { ability: "Beginner", height: "5'10\" / 178cm", length: "150–160cm" },
  { ability: "Beginner", height: "6'2\" / 188cm", length: "160–170cm" },
  { ability: "Intermediate", height: "4'10\" / 147cm", length: "135–142cm" },
  { ability: "Intermediate", height: "5'2\" / 157cm", length: "145–152cm" },
  { ability: "Intermediate", height: "5'6\" / 168cm", length: "150–160cm" },
  { ability: "Intermediate", height: "5'10\" / 178cm", length: "160–168cm" },
  { ability: "Intermediate", height: "6'2\" / 188cm", length: "170–178cm" },
  { ability: "Advanced", height: "5'6\" / 168cm", length: "160–170cm" },
  { ability: "Advanced", height: "5'10\" / 178cm", length: "170–180cm" },
  { ability: "Advanced", height: "6'2\" / 188cm", length: "178–188cm" },
];

export type MondopointRow = {
  mondo: string;
  usMens: string;
  usWomens: string;
  footLengthMm: string;
};

export const SKI_BOOT_MONDOPOINT_ROWS: MondopointRow[] = [
  { mondo: "22.5", usMens: "4.5", usWomens: "5.5", footLengthMm: "225" },
  { mondo: "24.0", usMens: "6.0", usWomens: "7.0", footLengthMm: "240" },
  { mondo: "25.5", usMens: "7.5", usWomens: "8.5", footLengthMm: "255" },
  { mondo: "27.0", usMens: "9.0", usWomens: "10.0", footLengthMm: "270" },
  { mondo: "28.5", usMens: "10.5", usWomens: "11.5", footLengthMm: "285" },
  { mondo: "30.0", usMens: "12.0", usWomens: "13.0", footLengthMm: "300" },
];

export type DinRow = {
  weight: string;
  typeI: string;
  typeII: string;
  typeIII: string;
};

export const SKI_BINDING_DIN_ROWS: DinRow[] = [
  {
    weight: "44–54 lb / 20–24 kg",
    typeI: "0.75",
    typeII: "0.75–1.5",
    typeIII: "1.5–1.75",
  },
  {
    weight: "66–76 lb / 30–34 kg",
    typeI: "1.25–1.75",
    typeII: "1.5–3.0",
    typeIII: "2.5–3.5",
  },
  {
    weight: "89–108 lb / 40–49 kg",
    typeI: "2.5–3.0",
    typeII: "3.0–3.5",
    typeIII: "3.5–4.5",
  },
  {
    weight: "120–142 lb / 55–64 kg",
    typeI: "3.5–4.0",
    typeII: "4.0–5.0",
    typeIII: "5.0–6.0",
  },
  {
    weight: "154–174 lb / 70–79 kg",
    typeI: "5.0–5.5",
    typeII: "6.0–6.5",
    typeIII: "6.5–7.5",
  },
  {
    weight: "187–208 lb / 85–94 kg",
    typeI: "6.5–7.0",
    typeII: "7.5–8.5",
    typeIII: "8.5–9.5",
  },
  {
    weight: "220–241 lb / 100–109 kg",
    typeI: "8.0–8.5",
    typeII: "9.0–9.5",
    typeIII: "9.5–10.5",
  },
];

export type SnowboardLengthRow = {
  style: string;
  height: string;
  weight: string;
  length: string;
};

export const SNOWBOARD_LENGTH_ROWS: SnowboardLengthRow[] = [
  {
    style: "Freestyle / park",
    height: "5'2\" / 157cm",
    weight: "110–130 lb",
    length: "132–138cm",
  },
  {
    style: "Freestyle / park",
    height: "5'6\" / 168cm",
    weight: "130–160 lb",
    length: "142–148cm",
  },
  {
    style: "Freestyle / park",
    height: "5'10\" / 178cm",
    weight: "160–190 lb",
    length: "150–154cm",
  },
  {
    style: "All-mountain",
    height: "5'2\" / 157cm",
    weight: "110–130 lb",
    length: "138–144cm",
  },
  {
    style: "All-mountain",
    height: "5'6\" / 168cm",
    weight: "130–160 lb",
    length: "148–154cm",
  },
  {
    style: "All-mountain",
    height: "5'10\" / 178cm",
    weight: "160–190 lb",
    length: "154–158cm",
  },
  {
    style: "Freeride / powder",
    height: "5'6\" / 168cm",
    weight: "130–160 lb",
    length: "154–158cm",
  },
  {
    style: "Freeride / powder",
    height: "5'10\" / 178cm",
    weight: "160–190 lb",
    length: "158–162cm",
  },
  {
    style: "Freeride / powder",
    height: "6'2\" / 188cm",
    weight: "190–220 lb",
    length: "162–168cm",
  },
];

export type SnowboardBootRow = {
  usMens: string;
  usWomens: string;
  mondo: string;
  eu: string;
};

export const SNOWBOARD_BOOT_ROWS: SnowboardBootRow[] = [
  { usMens: "6.0", usWomens: "7.0", mondo: "24.0", eu: "38.5" },
  { usMens: "7.0", usWomens: "8.0", mondo: "25.0", eu: "40" },
  { usMens: "8.0", usWomens: "9.0", mondo: "26.0", eu: "41" },
  { usMens: "9.5", usWomens: "10.5", mondo: "27.5", eu: "42.5" },
  { usMens: "11.0", usWomens: "—", mondo: "29.0", eu: "44.5" },
  { usMens: "12.5", usWomens: "—", mondo: "30.5", eu: "46.5" },
];

export type SnowboardBindingRow = {
  size: string;
  usMens: string;
  usWomens: string;
};

export const SNOWBOARD_BINDING_ROWS: SnowboardBindingRow[] = [
  { size: "Small", usMens: "5–8", usWomens: "6–8.5" },
  { size: "Medium", usMens: "7–10", usWomens: "7.5–10" },
  { size: "Large", usMens: "9–13", usWomens: "—" },
];
