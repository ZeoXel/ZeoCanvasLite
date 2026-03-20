import Image from 'next/image'

export function Logo(props: Omit<React.ComponentPropsWithoutRef<'img'>, 'src' | 'alt' | 'width' | 'height'>) {
  return (
    <Image
      src="/logo.PNG"
      alt="Logo"
      width={109}
      height={40}
      className="h-10 w-auto"
      priority
      {...props}
    />
  )
}
