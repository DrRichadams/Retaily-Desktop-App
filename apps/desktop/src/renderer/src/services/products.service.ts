const productsAPI = window.retaily.products;

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  status?: "active" | "inactive" | "all";
}

function buildQuery(params: ProductListParams = {}) {
  const query = new URLSearchParams();

  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }

  if (params.limit !== undefined) {
    query.set("limit", String(params.limit));
  }

  if (params.search) {
    query.set("search", params.search);
  }

  if (params.categoryId) {
    query.set("categoryId", params.categoryId);
  }

  if (params.status) {
    query.set("status", params.status);
  }

  return query.toString();
}

export const productsService = {
  async stats() {
    return productsAPI.request<{ data: RetailyProductStats }>({
      method: "GET",
      endpoint: "/api/products/stats",
    });
  },

  async list(params: ProductListParams = {}) {
    const query = buildQuery(params);

    return productsAPI.request<RetailyProductListResponse>({
      method: "GET",
      endpoint: `/api/products${query ? `?${query}` : ""}`,
    });
  },

  async get(id: string) {
    return productsAPI.request<{ data: RetailyProduct }>({
      method: "GET",
      endpoint: `/api/products/${encodeURIComponent(id)}`,
    });
  },

  async create(input: RetailyProductInput) {
    return productsAPI.request<{ message: string; data: RetailyProduct }>({
      method: "POST",
      endpoint: "/api/products",
      body: input,
    });
  },

  async update(id: string, input: RetailyProductUpdate) {
    return productsAPI.request<{ message: string; data: RetailyProduct }>({
      method: "PATCH",
      endpoint: `/api/products/${encodeURIComponent(id)}`,
      body: input,
    });
  },

  async updateStatus(id: string, status: "active" | "inactive") {
    return productsAPI.request<{ message: string; data: RetailyProduct }>({
      method: "PATCH",
      endpoint: `/api/products/${encodeURIComponent(id)}/status`,
      body: { status },
    });
  },

  async categories() {
    return productsAPI.request<{ data: RetailyCategory[] }>({
      method: "GET",
      endpoint: "/api/products/categories",
    });
  },

  async createCategory(input: RetailyProductCategoryInput) {
    return productsAPI.request<{ message: string; data: RetailyCategory }>({
      method: "POST",
      endpoint: "/api/products/categories",
      body: input,
    });
  },

  async updateCategory(
    id: string,
    input: Partial<RetailyProductCategoryInput>,
  ) {
    return productsAPI.request<{ message: string; data: RetailyCategory }>({
      method: "PATCH",
      endpoint: `/api/products/categories/${encodeURIComponent(id)}`,
      body: input,
    });
  },

  async addBarcode(productId: string, barcode: string, isPrimary = false) {
    return productsAPI.request({
      method: "POST",
      endpoint: `/api/products/${encodeURIComponent(productId)}/barcodes`,
      body: { barcode, isPrimary },
    });
  },
};
