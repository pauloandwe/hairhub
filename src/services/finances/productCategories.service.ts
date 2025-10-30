import api from '../../config/api.config'

export class ProductCategoriesService {
  private servicePrefix = process.env.FINANCES_URL

  async createCategory(name: string, phone: string): Promise<any> {
    const payload = {
      data: {
        name,
      },
    }

    return api.post(this.servicePrefix + '/bills/product-categories', payload)
  }
}
