import { artwork } from "../../theme/assets";
export const catalog = [
  {
    id: 2,
    name: "Exercise Book",
    category: "Learning Materials",
    price: 120,
    image: artwork.book,
    cartImage: artwork.cartBook,
    stock: 40,
  },
  {
    id: 1,
    name: "Color Pencils",
    category: "Art Supplies",
    price: 180,
    image: artwork.pencils,
    cartImage: artwork.cartPencils,
    stock: 40,
  },
  {
    id: 3,
    name: "Napkins (Pack of 2)",
    category: "Hygiene",
    price: 150,
    image: artwork.napkins,
    cartImage: artwork.napkins,
    stock: 3,
  },
  {
    id: 4,
    name: "Daycare Uniform",
    category: "Clothing",
    price: 650,
    image: artwork.uniform,
    cartImage: artwork.cartUniform,
    stock: 15,
  },
];
export const formatMoney = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ETB";
