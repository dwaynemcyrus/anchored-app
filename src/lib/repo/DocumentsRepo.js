/**
 * DocumentsRepo defines the async contract for document persistence.
 */
export class DocumentsRepo {
  /**
   * @param {{ type?: string, limit?: number, offset?: number }=} options
   * @returns {Promise<Array<{ id: string, type: string, title: string | null, updatedAt: number }>>}
   */
  async list(options) {
    throw new Error("DocumentsRepo.list not implemented");
  }

  /**
   * @param {string} id
   * @returns {Promise<import("../../types/document").Document | null>}
   */
  async get(id) {
    throw new Error("DocumentsRepo.get not implemented");
  }

  /**
   * @param {{ type: string, body: string, meta?: Record<string, any> }} input
   * @returns {Promise<import("../../types/document").Document>}
   */
  async create(input) {
    throw new Error("DocumentsRepo.create not implemented");
  }

  /**
   * @param {string} id
   * @param {{ body?: string, title?: string | null, meta?: Record<string, any> }} patch
   * @returns {Promise<import("../../types/document").Document>}
   */
  async update(id, patch) {
    throw new Error("DocumentsRepo.update not implemented");
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    throw new Error("DocumentsRepo.delete not implemented");
  }
}
