import { NextResponse } from "next/server";

type Params = { beneficiaryId: string };

export async function GET(request: Request, context: { params: Params }) {
  return NextResponse.json({ message: "Listar encaminhamentos nao implementado", beneficiaryId: context.params.beneficiaryId });
}
