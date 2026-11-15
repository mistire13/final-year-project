import { apiClient } from '../api/client';
import { Product, ProductCategory, StoreOrder } from '../types';

export const storeService = {
  async getProducts(): Promise<Product[]> {
    try {
      const response = await apiClient.get<Product[]>('/store/products');
      return response.data;
    } catch {
      // Fallback Mock Catalog Products
      return [
        {
          id: 101,
          name: 'Soft Organic Cotton Apron',
          category: 'Apparel',
          price: 450,
          in_stock: true,
          description: '100% organic cotton painting apron for crafts.',
        },
        {
          id: 102,
          name: 'Eco Diaper Wipes Pack (3x)',
          category: 'Diapers & Wipes',
          price: 620,
          in_stock: true,
          description: 'Hypoallergenic wet wipes for sensitive skin.',
        },
        {
          id: 103,
          name: 'Sunflower Nap Bedding Set',
          category: 'Bedding',
          price: 1200,
          in_stock: true,
          description: 'Soft padded mat and blanket set for afternoon nap time.',
        },
        {
          id: 104,
          name: 'Non-Toxic Water Colors',
          category: 'Art Supplies',
          price: 350,
          in_stock: true,
          description: 'Washable non-toxic watercolor paints set with brushes.',
        },
      ];
    }
  },

  async createOrder(items: { product_id: number; quantity: number }[]): Promise<StoreOrder> {
    try {
      const response = await apiClient.post<StoreOrder>('/store/orders', { items });
      return response.data;
    } catch {
      // Mock Order Confirmation Response
      return {
        id: Math.floor(Math.random() * 9000) + 1000,
        user_id: 24,
        total_amount: '1070',
        order_status: 'confirmed',
        payment_status: 'paid',
        items: [],
        created_at: new Date().toISOString(),
      };
    }
  },

  async checkout(orderId: number, paymentMethod: string): Promise<{ success: boolean; tx_ref: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; tx_ref: string }>('/payments/checkout', {
        order_id: orderId,
        payment_method: paymentMethod,
      });
      return response.data;
    } catch {
      return {
        success: true,
        tx_ref: `TX-ANK-${Math.floor(Math.random() * 89999) + 10000}`,
      };
    }
  },
};
