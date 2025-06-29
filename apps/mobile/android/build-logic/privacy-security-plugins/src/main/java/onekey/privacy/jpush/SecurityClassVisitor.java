package onekey.privacy.jpush;

import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

public class SecurityClassVisitor extends ClassVisitor {
    private String className;

    public SecurityClassVisitor(ClassVisitor classVisitor) {
        super(Opcodes.ASM9, classVisitor);
    }


    @Override
    public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
        this.className = name;
        super.visit(version, access, name, signature, superName, interfaces);
    }

    @Override
    public MethodVisitor visitMethod(int access, String name, String descriptor,
                                     String signature, String[] exceptions) {
        MethodVisitor methodVisitor = super.visitMethod(access, name, descriptor, signature, exceptions);

        if (methodVisitor != null && "cn/jiguang/internal/JCoreInternalHelper".equals(className) && "directHandle".equals(name)) {
            return new SecurityMethodVisitor(methodVisitor, name, descriptor);
        }

        return methodVisitor;
    }
}
