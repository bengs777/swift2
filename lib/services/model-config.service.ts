import { prisma } from "@/lib/db/client"
import { getRuntimeModelOptions } from "@/lib/ai/runtime-models"

export class ModelConfigService {
  static async ensureDefaults() {
    const runtimeOptions = getRuntimeModelOptions()
    const defaultModelKeys = runtimeOptions.map((model) => model.key)

    await Promise.all(
      runtimeOptions.map((model) =>
        prisma.modelConfig.upsert({
          where: { key: model.key },
          update: {
            provider: model.provider,
            modelName: model.modelName,
            price: model.price,
            isActive: model.isActive,
          },
          create: {
            key: model.key,
            provider: model.provider,
            modelName: model.modelName,
            price: model.price,
            isActive: model.isActive,
          },
        })
      )
    )

    await prisma.modelConfig.updateMany({
      where: {
        key: {
          notIn: defaultModelKeys,
        },
      },
      data: {
        isActive: false,
      },
    })
  }

  static async getActiveModels() {
    await this.ensureDefaults()

    return prisma.modelConfig.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    })
  }

  static async getActiveModelByKey(key: string) {
    await this.ensureDefaults()

    return prisma.modelConfig.findFirst({
      where: {
        key,
        isActive: true,
      },
    })
  }
}
