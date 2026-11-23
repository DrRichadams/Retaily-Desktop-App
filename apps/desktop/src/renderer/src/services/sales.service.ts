import { unwrapSalesResult } from "../../../shared/sales-ipc";
export { SalesServiceError } from "../../../shared/sales-ipc";

const salesAPI = window.retaily.sales;

export type SalesListParams = RetailySalesListQuery;

export const salesService = {
  async createSale(
    input: RetailyCreateSaleRequest,
    idempotencyKey: string,
  ) {
    return unwrapSalesResult(await salesAPI.createSale(input, idempotencyKey));
  },

  async listSales(query: SalesListParams = {}) {
    return unwrapSalesResult(await salesAPI.listSales(query));
  },

  async getSale(id: string) {
    return unwrapSalesResult(await salesAPI.getSale(id));
  },

  async saveCheckoutAttempt(
    input: RetailyCreateSaleRequest,
    idempotencyKey: string,
  ) {
    return unwrapSalesResult(
      await salesAPI.saveCheckoutAttempt(input, idempotencyKey),
    );
  },

  async listPendingCheckoutAttempts() {
    return unwrapSalesResult(await salesAPI.listPendingCheckoutAttempts());
  },

  async getCheckoutAttempt(idempotencyKey: string) {
    return unwrapSalesResult(
      await salesAPI.getCheckoutAttempt(idempotencyKey),
    );
  },
};
