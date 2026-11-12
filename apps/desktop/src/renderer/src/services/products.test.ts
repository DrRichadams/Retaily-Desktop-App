import { productsService } from "./products.service";

export async function testProductsConnection() {
  try {
    const result = await productsService.list({
      page: 1,
      limit: 10,
    });

    console.log("Products connection successful:", result);

    return result;
  } catch (error) {
    console.error("Products connection failed:", error);
    throw error;
  }
}
