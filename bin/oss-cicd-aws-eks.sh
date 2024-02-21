#!/bin/bash
AWS_REGION="us-west-2"
SHORT_REGION="uswe2"
CELL="w-oss-cicd"
AWS_PROFILE="oss-cicd/AWSAdministratorAccess"
ACCOUNT=$(aws sts get-caller-identity --output text --query Account --profile ${AWS_PROFILE})
aws eks update-kubeconfig --profile ${AWS_PROFILE} --region ${AWS_REGION} --name "$CELL" --alias "$CELL" --user-alias "$CELL" --role-arn "arn:aws:iam::${ACCOUNT}:role/${CELL}-rw-person-user"
