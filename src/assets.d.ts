declare module "aj:assets" {
  const data: {
    shell: string;
    assets: Record<string, { type: string; body: string }>;
  };
  export default data;
}
