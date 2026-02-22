/**
 * BlobStore — IndexedDB-based large binary storage for Fortuna Engine.
 * Used to store high-resolution document images and bypass localStorage limits.
 */

const DB_NAME = 'fortuna_blob_store'
const STORE_NAME = 'blobs'
const DB_VERSION = 1

export interface BlobRecord {
    id: string
    data: string // Base64 or Blob
    mimeType: string
    timestamp: number
}

class BlobStoreClass {
    private db: IDBDatabase | null = null

    private async getDB(): Promise<IDBDatabase> {
        if (this.db) return this.db

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                this.db = request.result
                resolve(request.result)
            }

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' })
                }
            }
        })
    }

    /**
     * Store a large string or Blob.
     */
    async save(id: string, data: string, mimeType: string = 'image/jpeg'): Promise<void> {
        const db = await this.getDB()
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            
            const record: BlobRecord = {
                id,
                data,
                mimeType,
                timestamp: Date.now()
            }

            const request = store.put(record)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })
    }

    /**
     * Retrieve data from the store.
     */
    async get(id: string): Promise<BlobRecord | null> {
        const db = await this.getDB()
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.get(id)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result || null)
        })
    }

    /**
     * Delete a specific blob.
     */
    async delete(id: string): Promise<void> {
        const db = await this.getDB()
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.delete(id)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })
    }

    /**
     * Clear all blobs (use with caution).
     */
    async clear(): Promise<void> {
        const db = await this.getDB()
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.clear()

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })
    }
}

export const BlobStore = new BlobStoreClass()
