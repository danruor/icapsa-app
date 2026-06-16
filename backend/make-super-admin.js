import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const email = process.argv[2]
if (!email) {
  console.log('Uso: node make-super-admin.js correo@ejemplo.com')
  process.exit(1)
}

const user = await prisma.user.update({
  where: { email },
  data: { role: 'SUPER_ADMIN', isActive: true }
})
console.log(`✓ ${user.name} (${user.email}) ahora es SUPER_ADMIN`)
process.exit(0)
