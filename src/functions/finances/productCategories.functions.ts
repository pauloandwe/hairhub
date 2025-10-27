import { ProductCategoriesService } from '../../services/finances/productCategories.service'

const productCategoriesService = new ProductCategoriesService()

export const productCategoriesFunctions: {
  [key: string]: (args: any) => Promise<any>
} = {
  createCategory: async (args: { name: string; phone: string }) => {
    try {
      const response = await productCategoriesService.createCategory(args.name, args.phone)
      return response.data
    } catch (error) {
      console.error('Erro ao criar categoria:', error)
      throw error
    }
  },
}
